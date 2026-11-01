'use strict';
/* =====================================================================
   world.js — Mini-cluster Kubernetes simulé + moteur kubectl
   Utilisé par « Opération TLX ». Aucune dépendance externe.
   ===================================================================== */
const W = (() => {

  /* ---------------- utilitaires ---------------- */
  const b36 = n => Math.random().toString(36).slice(2, 2 + n);
  const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
  function fmtTable(headers, rows) {
    const w = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] == null ? '' : r[i]).length)));
    const line = cells => cells.map((c, i) => pad(c == null ? '' : c, w[i])).join('  ').replace(/\s+$/, '');
    return [line(headers), ...rows.map(r => line(r))];
  }
  function parseCpu(v) { // '500m' | '2' → cœurs
    if (!v) return 0;
    const m = /^([\d.]+)(m)?$/.exec(String(v).trim());
    return m ? (m[2] ? parseFloat(m[1]) / 1000 : parseFloat(m[1])) : 0;
  }
  function parseMem(v) { // '512Mi' | '4Gi' → Mi
    if (!v) return 0;
    const m = /^([\d.]+)(Mi|Gi)?$/.exec(String(v).trim());
    return m ? (m[2] === 'Gi' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])) : 0;
  }
  const reqTxt = (txt, re, dflt) => { const m = txt.match(re); return m ? m[1] : dflt; };

  /* ---------------- fabriques ---------------- */
  function node(name, role, usedCpu) {
    return {
      name, role: role || 'worker', status: 'Ready', version: 'v1.31.4',
      cpu: '32 cores', mem: '128 Gi', allocCpu: 31.5, allocMem: 122880,
      usedCpu: usedCpu == null ? 5 : usedCpu,
      taints: role === 'control-plane' ? ['node-role.kubernetes.io/control-plane:NoSchedule'] : []
    };
  }
  let ipSeq = 17;
  function pod(o) {
    ipSeq += 3 + Math.floor(Math.random() * 40);
    return Object.assign({
      name: '', ns: 'tlx', node: '', phase: 'Pending', ready: '0/1', restarts: 0,
      age: '30s', ip: '10.42.' + (2 + (ipSeq % 6)) + '.' + (100 + (ipSeq % 140)),
      owner: { kind: 'Pod', name: '' }, labels: {}, image: '', containers: 'nwas',
      ports: '8000/TCP 3200/TCP', envFrom: [], env: [], mounts: [], probes: [],
      reqCpu: 0.5, reqMem: 2048, limMem: 4096,
      liveness: '', readiness: '', pendingReason: '', pendingUntil: 0, terminateAt: 0,
      crashMsg: '', nextCrash: 0, probeBad: false, nextProbeKick: 0,
      metrics: { cpu: '312m', mem: '2.1Gi' },
      events: [], logs: [], createdAt: Date.now()
    }, o);
  }
  function deployment(name, o) {
    return Object.assign({
      name, ns: 'tlx', image: 'reg.translogix.io/nwas:7.50-sp22', replicas: 3, ready: 0,
      strategy: 'RollingUpdate', maxSurge: '25%', maxUnavailable: '25%',
      labels: { app: name }, container: 'nwas', ports: '8000/TCP 3200/TCP',
      envFrom: [], probes: [],
      requestsTxt: 'cpu: 500m / mem: 2Gi', limitsTxt: 'cpu: 1 / mem: 4Gi',
      rsHash: b36(5) + 'f', gen: 1, prevImage: null, brokenImage: false, rolling: false,
      cAge: '2d', createdAt: Date.now()
    }, o);
  }
  function statefulset(name, o) {
    return Object.assign({
      name, ns: 'tlx', image: 'reg.translogix.io/hana-tlx:2.0-sp07', replicas: 2,
      labels: { app: name }, ports: '30003/TCP', cAge: '2m',
      claims: [{ name: name + '-data', size: '200Gi' }], createdAt: Date.now()
    }, o);
  }
  function svc(name, o) {
    return Object.assign({
      name, ns: 'tlx', type: 'ClusterIP',
      clusterIP: '10.100.' + (10 + Math.floor(Math.random() * 90)) + '.' + (10 + Math.floor(Math.random() * 200)),
      ports: '3200/TCP 3300/TCP', selector: { app: name }, age: '2m'
    }, o);
  }
  function cm(name, data, age) { return { name, ns: 'tlx', data: data || {}, age: age || '2m' }; }
  function secret(name, keys, age) { return { name, ns: 'tlx', keys: keys || [], age: age || '2m' }; }
  function pvc(name, size) {
    return { name, ns: 'tlx', phase: 'Bound', volume: 'pvc-' + b36(4), size: size || '200Gi', sc: 'fast-ssd', age: '1m' };
  }
  function hpa(name, ref, min, max, load) {
    return { name, ns: 'tlx', ref, cpuTarget: 60, min, max, load: load == null ? 30 : load, replicas: min };
  }
  function logEvent(w, obj, type, reason, message, age) {
    w.events.unshift({ obj, type: type || 'Normal', reason, message, age: age || '12s' });
  }
  function schedule(w, ms, fn) { w.actions.push({ at: Date.now() + ms, fn }); }

  /* ---------------- helpers d'état ---------------- */
  const podsOf = (w, dep) => w.pods.filter(p => p.owner.kind === 'ReplicaSet' && p.owner.name === dep.name + '-' + dep.rsHash);
  const podsSec = (w, sel) => w.pods.filter(p => Object.keys(sel).every(k => p.labels[k] === sel[k]));
  function nodeIP(n) {
    const i = (parseInt((n.match(/(\d+)$/) || ['0', '1'])[1], 10) % 4) + 1;
    return '10.0.4.2' + i;
  }
  function pickNode(w) {
    const cands = w.nodes.filter(n => n.status === 'Ready' && n.role === 'worker');
    return cands.length ? cands[Math.floor(Math.random() * cands.length)].name : w.nodes[0].name;
  }
  function deployByName(w, ownerName) { // owner 'tlx-aas-7f9c4f' → deployment
    return w.deployments.find(d => ownerName.indexOf(d.name) === 0) || null;
  }
  function podForDep(w, dep, opts) {
    opts = opts || {};
    const p = pod({
      name: dep.name + '-' + dep.rsHash + '-' + b36(5),
      ns: dep.ns, node: opts.node || pickNode(w),
      owner: { kind: 'ReplicaSet', name: dep.name + '-' + dep.rsHash },
      labels: Object.assign({}, dep.labels), image: dep.image,
      ports: dep.ports, envFrom: dep.envFrom, probes: dep.probes || [],
      reqCpu: parseCpu(reqTxt(dep.requestsTxt, /cpu:\s*([\d.m]+)/, '500m')),
      reqMem: parseMem(reqTxt(dep.requestsTxt, /mem:\s*([\d.GMi]+)/, '2Gi')),
      limMem: parseMem(reqTxt(dep.limitsTxt, /mem:\s*([\d.GMi]+)/, '4Gi')),
      metrics: Object.assign({}, dep.metrics || {}),
      phase: opts.phase || 'Pending', createdAt: Date.now()
    });
    p.pendingUntil = Date.now() + (opts.delay || 1200);
    p.rsGen = dep.gen;
    w.pods.push(p);
    logEvent(w, 'pod/' + p.name, 'Normal', 'Scheduled', 'Successfully assigned to ' + p.node, '<5s');
    return p;
  }
  function makeRunning(w, dep, extra) {
    const p = podForDep(w, dep, {});
    p.phase = 'Running'; p.ready = '1/1';
    Object.assign(p, extra || {});
    return p;
  }

  /* suppression d'un pod + résurrection par le contrôleur */
  function removePod(w, p) {
    w.pods = w.pods.filter(x => x !== p);
    if (p.owner.kind === 'ReplicaSet') {
      const dep = deployByName(w, p.owner.name);
      if (dep && w.deployments.includes(dep)) {
        schedule(w, 700, () => {
          if (!w.deployments.includes(dep)) return;
          const mine = podsOf(w, dep);
          const alive = mine.filter(z => z.phase !== 'Terminating' && z.phase !== 'OOMKilled');
          if (alive.length + mine.filter(z => z.phase === 'Pending').length < dep.replicas) {
            const np = podForDep(w, dep, {});
            schedule(w, 1300, () => {
              if (np.phase === 'Pending') { np.phase = 'Running'; np.ready = '1/1'; logEvent(w, 'pod/' + np.name, 'Normal', 'Started', 'Container started'); }
            });
          }
        });
      }
    }
    if (p.owner.kind === 'StatefulSet') {
      const sts = w.statefulsets.find(s => s.name === p.owner.name);
      if (sts && w.statefulsets.includes(sts)) {
        schedule(w, 900, () => {
          if (!w.statefulsets.includes(sts)) return;
          const i = (p.name.match(/-(\d+)$/) || [, '0'])[1];
          const np = PodNameSts(w, sts, parseInt(i, 10));
          schedule(w, 1500, () => {
            if (np.phase === 'Pending') { np.phase = 'Running'; np.ready = '1/1'; np.logs = genStsLogs(np); }
          });
        });
      }
    }
  }
  function PodNameSts(w, sts, i) {
    const name = sts.name + '-' + i;
    let p = w.pods.find(x => x.name === name);
    if (!p) {
      p = pod({
        name, ns: sts.ns, node: pickNode(w),
        owner: { kind: 'StatefulSet', name: sts.name },
        labels: Object.assign({}, sts.labels), image: sts.image, ports: sts.ports,
        reqCpu: 4, reqMem: 16384, limMem: 32768,
        mounts: ['/hana/data ← ' + sts.claims[0].name + '-' + name + ' (PVC retained)'],
        phase: 'Pending', ready: '0/1'
      });
      p.pendingUntil = Date.now() + 1500;
      w.pods.push(p);
    }
    return p;
  }
  function genStsLogs(p) {
    return [
      { lvl: '', t: '[hana] Volume opened: JOURNALS INTACT ✔' },
      { lvl: 'INFO', t: '[hana] Log replay: 0 lost transaction' },
      { lvl: 'INFO', t: '[hana] Election: PRIMARY re-elected' },
      { lvl: '', t: '[hana] System replication active (secondary connected)' }
    ];
  }

  /* ---------------- tick d'état (400-800 ms par le terminal) ---------------- */
  function tick(w) {
    const now = Date.now();
    w.narr = [];
    const due = w.actions.filter(a => a.at <= now);
    w.actions = w.actions.filter(a => !due.includes(a));
    due.forEach(a => { try { a.fn(w, w.narr); } catch (e) { } });

    w.pods.slice().forEach(p => {
      if (p.phase === 'Terminating' && p.terminateAt && now > p.terminateAt) {
        w.narr.push({ cls: 'muted', t: 'pod/' + p.name + ' finished and removed' });
        removePod(w, p);
        return;
      }
      if (p.phase === 'Pending' && !p.pendingReason && p.node && p.pendingUntil && now > p.pendingUntil) {
        p.phase = 'Running'; p.ready = '1/1';
        logEvent(w, 'pod/' + p.name, 'Normal', 'Started', 'Container started');
      }
      if (p.phase === 'CrashLoopBackOff' && p.nextCrash && now > p.nextCrash && p.crashEachTick) {
        p.restarts += 1; p.nextCrash = now + 2400; p.crashEachTick(p);
      }
      if (p.probeBad && p.nextProbeKick && now > p.nextProbeKick) {
        p.restarts += 1; p.nextProbeKick = now + 4500;
        w.narr.push({ cls: 'warn', t: '⚠ kubelet: liveness probe FAILS → container restarted (attempt #' + p.restarts + ')' });
      }
    });

    // ReplicaSet : réconcilier les réplicas + rolling update
    w.deployments.forEach(d => {
      const mine = w.pods.filter(p => p.owner.kind === 'ReplicaSet' && p.owner.name.indexOf(d.name + '-') === 0);
      const alive = mine.filter(p => p.phase !== 'Terminating' && p.phase !== 'OOMKilled');
      const cur = alive.filter(p => p.rsGen === d.gen);
      const old = alive.filter(p => p.rsGen !== d.gen);
      const stuck = cur.some(p => p.phase === 'ImagePullBackOff' || p.phase === 'CrashLoopBackOff' || p.phase === 'Pending');

      // combler les réplicas courants (un à la fois)
      if (cur.length < d.replicas && !stuck) {
        const np = podForDep(w, d, d.brokenImage ? { phase: 'ImagePullBackOff', delay: 400 } : { delay: 1100 });
        if (d.brokenImage) {
          np.events = np.events || [];
          np.events.unshift({ type: 'Warning', reason: 'ErrImagePull', message: "Image \"" + d.image + '" not found in the registry', age: '5s' });
        }
        schedule(w, 1300, () => {
          if (np.phase === 'Pending') { np.phase = 'Running'; np.ready = '1/1'; logEvent(w, 'pod/' + np.name, 'Normal', 'Started', 'Container started'); }
        });
        // limiter le pic : retirer un ancien pod si l excédent dépasse +25 %
        if (old.length && alive.length + 1 > Math.ceil(d.replicas * 1.25)) {
          const v = old.filter(p => p.phase === 'Running').sort((a, b) => a.createdAt - b.createdAt)[0];
          if (v) { v.phase = 'Terminating'; v.terminateAt = now + 700; }
        }
      }
      // écoulement progressif des pods de l ancienne génération (rolling update)
      if (d.rolling && old.length) {
        const victim = old.filter(p => p.phase === 'Running').sort((a, b) => a.createdAt - b.createdAt)[0];
        if (victim && !cur.some(p => p.phase === 'Pending' || p.phase === 'ImagePullBackOff')) {
          victim.phase = 'Terminating'; victim.terminateAt = now + 700;
        }
      } else if (d.rolling) { d.rolling = false; }
      // excédent de pods courants (scale down)
      if (cur.length > d.replicas) {
        const extra = cur.filter(p => p.phase === 'Running').sort((a, b) => a.createdAt - b.createdAt)[0];
        if (extra) { extra.phase = 'Terminating'; extra.terminateAt = now + 700; }
      }
      d.ready = alive.filter(p => p.phase === 'Running' && p.ready === '1/1').length;
    });

    // StatefulSet : pods ordonnés
    w.statefulsets.forEach(sts => {
      for (let i = 0; i < sts.replicas; i++) {
        const name = sts.name + '-' + i;
        const exists = w.pods.some(x => x.name === name);
        if (!exists) {
          if (i === 0) { PodNameSts(w, sts, 0); break; }
          const prev = w.pods.find(x => x.name === sts.name + '-' + (i - 1));
          if (prev && prev.phase === 'Running') { PodNameSts(w, sts, i); break; }
          break;
        }
        // si 0 est apparu, laisser le tick suivant créer le 1
      }
      sts.ready = w.pods.filter(p => p.owner.name === sts.name && p.phase === 'Running').length;
    });

    // HPA
    w.hpas.forEach(h => {
      const d = w.deployments.find(x => x.name === h.ref);
      if (!d) return;
      if (h.load > h.cpuTarget && d.replicas < h.max) {
        d.replicas++; h.replicas = d.replicas;
        w.narr.push({ cls: 'acc', t: '📈 HPA: load ' + h.load + '% > target ' + h.cpuTarget + '% → scaling up to ' + d.replicas + ' replicas' });
      } else if (h.load < h.cpuTarget - 20 && d.replicas > h.min) {
        d.replicas--; h.replicas = d.replicas;
        w.narr.push({ cls: 'muted', t: '📉 HPA: load ' + h.load + '% < target ' + h.cpuTarget + '% → back to ' + d.replicas + ' replicas' });
      }
    });

    // pods Pending sans node : nouvelle capacité disponible ?
    w.pods.forEach(p => {
      if (p.phase === 'Pending' && p.pendingReason && !p.node) {
        const spot = w.nodes.find(n => n.status === 'Ready' && n.role === 'worker' && (n.allocCpu - n.usedCpu) > p.reqCpu);
        if (spot) {
          p.node = spot.name; p.pendingReason = ''; p.pendingUntil = Date.now() + 1200;
          logEvent(w, 'pod/' + p.name, 'Normal', 'Scheduled', 'Successfully assigned to ' + spot.name + ' (fresh capacity available)');
        }
      }
    });
    return w.narr;
  }

  /* ---------------- construction des mondes ---------------- */
  function blank() {
    return {
      nodes: [], pods: [], deployments: [], statefulsets: [], services: [],
      configmaps: [], secrets: [], pvcs: [], hpas: [],
      files: {}, events: [], actions: [], narr: [], ns: 'tlx', sc: ''
    };
  }
  function addCluster(w, workers, used) {
    w.nodes.push(node('k8s-ctl-1', 'control-plane'), node('k8s-ctl-2', 'control-plane'));
    for (let i = 1; i <= (workers || 3); i++) w.nodes.push(node('k8s-worker-0' + i, 'worker', used ? 4 + i * 3 : null));
    w.sc = 'fast-ssd (default · azure-disk provisioner · 3 replicas)';
  }
  function fakePasLogs(dias) {
    return [
      { lvl: '', t: 'SAP NetWeaver Application Server 7.50 SP22 — starting' },
      { lvl: 'INFO', t: '[ms] Message Server listening on 3900 ✔' },
      { lvl: 'INFO', t: '[disp] work processes ⇒ DIA ' + (dias || 10) + ' · BTC 6 · SPO 2 · UP 2' },
      { lvl: 'INFO', t: '[icm] HTTP active on 8000 ✔' },
      { lvl: '', t: 'Instance operational in 52 s' }
    ];
  }

  const factories = {};
  function reg(id, fn) { factories[id] = fn; }

  reg('empty', () => { const w = blank(); addCluster(w); return w; });

  /* 1.2 — lancement manuel d'un pod */
  reg('firstPod', () => { const w = blank(); addCluster(w); return w; });

  /* 2.1 — mini paysage tlx */
  reg('tlxMini', () => {
    const w = blank(); addCluster(w);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10', 'rdisp/wp_no_btc': '6', 'rdisp/wp_no_spo': '2' }));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD', 'SSFS_KEY']));
    const d = deployment('tlx-pas', { replicas: 1 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    makeRunning(w, d, { age: '2m', logs: fakePasLogs() });
    w.services.push(svc('tlx-sapms', { ports: '3300/TCP', age: '12m' }));
    return w;
  });

  /* 2.2 — ConfigMaps & secrets (break/fix) */
  reg('profileLab', () => {
    const w = blank(); addCluster(w);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10', 'rdisp/wp_no_btc': '6' }, '4m'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '4m'));
    const d = deployment('tlx-pas', { replicas: 1 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    const p = makeRunning(w, d, { age: '10m', logs: fakePasLogs() });
    /* un nouveau pod lit la ConfigMap COURANTE :
       wp_no_dia = 0 → crash en boucle ; autre valeur → logs conformes */
    w.podMaker = () => {
      const np = podForDep(w, d, {});
      const dia = w.configmaps[0].data['rdisp/wp_no_dia'];
      if (dia === '0') {
        np.logs = [
          { lvl: '', t: '[disp] loading profile from ConfigMap/tlx-profile…' },
          { lvl: 'ERR', t: 'FATAL: rdisp/wp_no_dia = 0 — forbidden as well (minimum 1 DIA required)' },
          { lvl: 'ERR', t: '[disp] shutting down the instance, code 1' }
        ];
        schedule(w, 1500, () => {
          np.phase = 'CrashLoopBackOff'; np.ready = '0/1'; np.crashEachTick = () => { }; np.nextCrash = 0;
          np.events.unshift({ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container (invalid SAP profile)', age: '8s' });
        });
      } else {
        np.logs = fakePasLogs(parseInt(dia, 10) || 10);
      }
      return np;
    };
    w.files['profile-ok.yml'] = (ww, say) => {
      ww.configmaps[0].data = { 'rdisp/wp_no_dia': '12', 'rdisp/wp_no_btc': '8' };
      say('configmap/tlx-profile configured  (rdisp/wp_no_dia: 10→12, wp_no_btc: 6→8)', 'ok');
      say('⚠ la ConfigMap existe déjà : elle est MODIFIÉE, mais les pods qui tournent ne relisent PAS leur config.', 'warn');
    };
    w.files['profile-cassé.yml'] = (ww, say) => {
      ww.configmaps[0].data = { 'rdisp/wp_no_dia': '0', 'rdisp/wp_no_btc': '6' };
      say('configmap/tlx-profile configured  (rdisp/wp_no_dia: 0 ⚠)', 'warn');
    };
    return w;
  });
  // hook de recréation : si un pod du dep tlx-pas est supprimé, utiliser podMaker
  const origRemove = removePod;
  function removePodHook(w, p) {
    origRemove(w, p);
    if (w.podMaker) {
      w.actions = w.actions.filter(a => !(a.fn && a.tag !== 'maker'));
      if (p.owner.kind === 'ReplicaSet' && deployByName(w, p.owner.name) === w.deployments[0]) {
        schedule(w, 700, () => { if (w.pods.length === 0 && w.deployments[0]) w.podMaker(); }, null, 'maker');
      }
    }
  }

  /* 3.1 — Deployment & self-healing */
  reg('haLab', () => {
    const w = blank(); addCluster(w, 4);
    w.files['aas-deploy.yml'] = (ww, say) => {
      const d = deployment('tlx-aas', { replicas: 3, cAge: 'n/a' });
      d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
      ww.deployments.push(d);
      ww.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }));
      ww.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD']));
      say('deployment.apps/tlx-aas created  (replicas: 3 — je déclare l état souhaité)', 'ok');
      for (let i = 0; i < 3; i++) {
        const p = podForDep(w, d, {});
        schedule(w, 1300 + i * 500, () => { if (p.phase === 'Pending') { p.phase = 'Running'; p.ready = '1/1'; } });
      }
      logEvent(w, 'deployment/tlx-aas', 'Normal', 'ScalingReplicaSet', 'Passage de 0 à 3 réplicas demandés', '4s');
    };
    return w;
  });

  /* 3.2 — Services */
  reg('svcLab', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-aas', { replicas: 3 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '1h'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '1h'));
    for (let i = 0; i < 3; i++) makeRunning(w, d, { age: '35m', logs: [{ lvl: '', t: '[disp] Instance operational · 10 DIA ready (8000/tcp)' }] });
    /* le PAS, source du test de répartition */
    const pasa = deployment('tlx-pas', { replicas: 1 });
    pasa.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(pasa);
    makeRunning(w, pasa, { age: '2m', logs: fakePasLogs() });
    w.files['svc-aas.yml'] = (ww, say) => {
      const s = svc('tlx-aas', { ports: '8000/TCP 3200/TCP', age: '<5s' });
      ww.services.push(s);
      say('service/tlx-aas created  (ClusterIP: stable IP + internal DNS "' + s.name + '.tlx.svc.clusterset.local")', 'ok');
    };
    return w;
  });

  /* 4.1 — PVC */
  reg('storageLab', () => {
    const w = blank(); addCluster(w);
    w.files['pvc-hana.yml'] = (ww, say) => {
      const x = pvc('tlx-hana-data', '200Gi');
      ww.pvcs.push(x);
      say('persistentvolumeclaim/tlx-hana-data created  (200Gi, StorageClass fast-ssd)', 'ok');
      schedule(w, 800, () => {
        say('✔ the StorageClass provisioned the volume automatically: PVC "Bound"', 'ok');
        logEvent(w, 'pvc/tlx-hana-data', 'Normal', 'ProvisioningSucceeded', 'The provisioner created volume pvc-' + x.volume + ' (200Gi)', '3s');
      });
    };
    return w;
  });

  /* 4.2 — StatefulSet */
  reg('stsLab', () => {
    const w = blank(); addCluster(w, 4);
    w.files['sts-hana.yml'] = (ww, say) => {
      const sts = statefulset('tlx-hana', { replicas: 2 });
      ww.statefulsets.push(sts);
      say('statefulset.apps/tlx-hana created  (replicas: 2 — stable identity tlx-hana-0 / tlx-hana-1)', 'ok');
    };
    return w;
  });

  /* 5.1 — scale & HPA */
  reg('scaleLab', () => {
    const w = blank(); addCluster(w, 4);
    const d = deployment('tlx-aas', { replicas: 2 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '1h'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '1h'));
    for (let i = 0; i < 2; i++) makeRunning(w, d, { age: '2d', metrics: { cpu: '84%', mem: '2.4Gi' } });
    w.services.push(svc('tlx-aas', { ports: '8000/TCP 3200/TCP', age: '2d' }));
    w.files['hpa.yml'] = (ww, say) => {
      const h = hpa('tlx-aas', 'tlx-aas', 2, 6, 30);
      ww.hpas.push(h);
      say('horizontalpodautoscaler.autoscaling/tlx-aas created  (CPU target 60%, min 2, max 6)', 'ok');
      schedule(w, 2600, () => {
        h.load = 89;
        ww.narr.push({ cls: 'warn', t: '⚠ event: load spike (payroll run) — pods average CPU: 89%' });
      });
    };
    return w;
  });

  /* 5.2 — requests & limits */
  reg('resLab', () => {
    const w = blank(); addCluster(w, 4);
    const d = deployment('tlx-aas', { replicas: 3, limitsTxt: 'cpu: 1 / mem: 2Gi', requestsTxt: 'cpu: 500m / mem: 2Gi' });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '1h'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '1h'));
    for (let i = 0; i < 3; i++) makeRunning(w, d, { age: '3h', metrics: { cpu: '88%', mem: '1.9Gi' } });
    const victim = w.pods[1];
    victim.phase = 'OOMKilled'; victim.ready = '0/1'; victim.restarts = 4; victim.age = '1m';
    victim.logs = [
      { lvl: 'ERR', t: "[nwas] memory allocation refused — needs 2.3Gi > container limit 2Gi" },
      { lvl: 'ERR', t: '[nwas] SIGKILL signal received (exit 137) — instance terminated abruptly' },
      { lvl: 'INFO', t: '[nwas] requests in queue: DIA busy, payroll suspended'
      }
    ];
    victim.events = [
      { type: 'Warning', reason: 'OOMKilled', message: 'Container exceeded its memory limit (2Gi) — killed, exit 137', age: '55s' },
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', age: '40s' }
    ];
    logEvent(w, 'pod/' + victim.name, 'Warning', 'OOMKilled', 'Memory limit exceeded (exit 137)', '55s');
    w.files['aas-res-fix.yml'] = (ww, say) => {
      const dd = ww.deployments[0];
      dd.requestsTxt = 'cpu: 1 / mem: 4Gi';
      dd.limitsTxt = 'cpu: 2 / mem: 8Gi';
      dd.rsHash = b36(4) + '7'; dd.gen++;
      // remplacement contrôlé des anciens pods
      ww.pods.slice().forEach(p => {
        if (p.owner.kind === 'ReplicaSet' && p.owner.name.indexOf(dd.name) === 0) {
          p.phase = 'Terminating'; p.terminateAt = Date.now() + 600;
        }
      });
      say('deployment.apps/tlx-aas configured', 'ok');
      say('→ requests mem 2→4Gi · limits mem 2→8Gi · cpu 500m→1 · process limit 1→2', 'out');
      say('→ the rollout recreates the pods one by one with the new template (zero downtime)', 'acc');
      return;
    };
    return w;
  });

  /* 6.1 — rolling update */
  reg('rolloutLab', () => {
    const w = blank(); addCluster(w, 4);
    const d = deployment('tlx-aas', { replicas: 3 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    d.probes = ['Readiness: http-get :8000/sap/public/health (delay 25s, timeout 2s)'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '5d'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '5d'));
    for (let i = 0; i < 3; i++) {
      makeRunning(w, d, {
        age: '5d', probes: d.probes,
        logs: [{ lvl: '', t: '[nwas] kernel 7.50-sp22 operational · health 200 OK' }]
      });
    }
    return w;
  });

  /* 7.1 — debug : 5 theaters */
  reg('dbg1', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-dia', { replicas: 3, image: 'reg.translogix.io/nwas:7.51', brokenImage: true });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '20m'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '20m'));
    for (let i = 0; i < 3; i++) {
      const p = podForDep(w, d, { phase: 'ImagePullBackOff', delay: 100 });
      p.pendingUntil = 0;
      p.events = [
        { type: 'Normal', reason: 'Pulling', message: 'Pulling image "reg.translogix.io/nwas:7.51"', age: '68s' },
        { type: 'Warning', reason: 'ErrImagePull', message: "Failed to pull image \"reg.translogix.io/nwas:7.51\": the tag 7.51 does not exist in the registry", age: '60s' },
        { type: 'Warning', reason: 'BackOff', message: "Back-off pulling image \"reg.translogix.io/nwas:7.51\"", age: '12s' }
      ];
    }
    logEvent(w, 'deployment/tlx-dia', 'Warning', 'ErrImagePull', 'Image reg.translogix.io/nwas:7.51 not found in the registry', '1m');
    return w;
  });
  reg('dbg2', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-btc', { replicas: 2 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_btc': '8' }, '1h'));
    // PAS de secret tlx-dbcreds : LE bug
    for (let i = 0; i < 2; i++) {
      const p = podForDep(w, d, { phase: 'CrashLoopBackOff', delay: 100 });
      p.pendingUntil = 0; p.crashEachTick = () => { }; p.nextCrash = 0;
      p.logs = [
        { lvl: '', t: '[btc] boot: loading the database credentials…' },
        { lvl: 'ERR', t: "FATAL: secret 'tlx-dbcreds' not found (CreateContainerConfigError)" },
        { lvl: 'ERR', t: '[btc] process terminated, code 1' }
      ];
      p.events = [
        { type: 'Warning', reason: 'FailedSecret', message: "Secret \"tlx-dbcreds\" does not exist in the tlx namespace", age: '17m' },
        { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', age: '58s' }
      ];
    }
    logEvent(w, 'deployment/tlx-btc', 'Warning', 'CrashLoopBackOff', 'Credentials unavailable: secret tlx-dbcreds missing', '16m');
    w.files['creds-secret.yml'] = (ww, say) => {
      ww.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD', 'SSFS_KEY']));
      say('secret/tlx-dbcreds created  (the SQL credentials are back — values invisible by design)', 'ok');
      say('⚠ remember to recreate the pods so they re-read the Secret list at startup.', 'warn');
    };
    return w;
  });
  reg('dbg3', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-dia', { replicas: 8 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '12' }, '1h'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '1h'));
    for (let i = 0; i < 3; i++) makeRunning(w, d, { age: '20m' });
    for (let i = 0; i < 5; i++) {
      const p = podForDep(w, d, { delay: 100 });
      p.node = ''; p.pendingReason = 'Insufficient cpu'; p.pendingUntil = 0;
      p.events = [
        { type: 'Warning', reason: 'FailedScheduling', message: '0/5 nodes available: 2 control-plane (NoSchedule) · 3 workers "Insufficient cpu"', age: '9m' }
      ];
    }
    w.nodes.forEach((n, idx) => { if (n.role === 'worker') n.usedCpu = [30.4, 30.1, 29.8][idx - 2] || 30; });
    logEvent(w, 'deployment/tlx-dia', 'Warning', 'Pending', '5 pending pods: insufficient CPU capacity on the cluster', '8m');
    w.files['node-add.yml'] = (ww, say) => {
      const n = node('k8s-worker-09', 'worker', 0);
      ww.nodes.push(n);
      say('node/k8s-worker-09 joined  (new worker: 32 cores available)', 'ok');
      logEvent(w, 'node/k8s-worker-09', 'Normal', 'NodeReady', 'New node ready, pending pods will be assigned to it', '5s');
    };
    return w;
  });
  reg('dbg4', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-dia', { replicas: 2 });
    d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
    d.probes = ['Liveness: http-get :8000/health (delay 5s, timeout 2s)'];
    w.deployments.push(d);
    w.configmaps.push(cm('tlx-profile', { 'rdisp/wp_no_dia': '10' }, '1h'));
    w.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD'], '1h'));
    for (let i = 0; i < 2; i++) {
      const p = makeRunning(w, d, { age: '4m' });
      p.probeBad = true; p.nextProbeKick = Date.now() + 600; p.probes = d.probes;
      p.logs = [
        { lvl: '', t: '[nwas] starting… warming up the ICM buffers (≈75 s in this scenario)' },
        { lvl: 'INFO', t: '[nwas] preloading metadata: 34%…' },
        { lvl: 'WARN', t: '[kubelet] liveness /health → not ready (the instance is still starting)' }
      ];
    }
    logEvent(w, 'deployment/tlx-dia', 'Warning', 'RestartingLoop', 'Liveness probe kills the containers too early (delay=5s)', '3m');
    w.files['probe-fix.yml'] = (ww, say) => {
      const dd = ww.deployments[0];
      dd.probes = ['Liveness: http-get :8000/health (delay 90s, timeout 5s)'];
      dd.gen++; dd.rsHash = b36(4) + 'c';
      ww.pods.slice().forEach(p => {
        if (p.owner.kind === 'ReplicaSet' && p.owner.name.indexOf(dd.name) === 0) {
          p.phase = 'Terminating'; p.terminateAt = Date.now() + 500;
        }
      });
      say('deployment.apps/tlx-dia configured  (liveness: delay 5s → 90s)', 'ok');
    };
    return w;
  });
  reg('dbg5', () => {
    const w = blank(); addCluster(w);
    const d = deployment('tlx-fiori', { replicas: 3, container: 'fiori-gw' });
    d.labels = { run: 'tlx-fiori' };
    w.deployments.push(d);
    for (let i = 0; i < 3; i++) {
      const p = makeRunning(w, d, { age: '1h', ports: '8080/TCP' });
      p.labels = { run: 'tlx-fiori' };
      p.logs = [{ lvl: '', t: '[gw] HTTP server ready on 8080' }];
    }
    const s = svc('tlx-web', { ports: '80/TCP', age: '55m' });
    s.selector = { app: 'tlx-fiori' }; // MISMATCH : les pods portent run=tlx-fiori
    w.services.push(s);
    logEvent(w, 'service/tlx-web', 'Warning', 'NoEndpoints', 'The service tlx-web has 0 endpoints: its selector matches no pod', '40m');
    w.files['svc-fix.yml'] = (ww, say) => {
      ww.services[0].selector = { run: 'tlx-fiori' };
      say('service/tlx-web configured  (selector app=tlx-fiori → run=tlx-fiori)', 'ok');
      logEvent(w, 'service/tlx-web', 'Normal', 'EndpointsAdded', '3 endpoints connected to the service', '4s');
    };
    return w;
  });

  /* 8.1 — assemblage final TLX */
  reg('landLab', () => {
    const w = blank(); addCluster(w, 4);
    w.files['tlx-landscape.yml'] = (ww, say) => {
      say('namespace/tlx unchanged', 'ok');
      const cmx = cm('tlx-profile', { 'rdisp/wp_no_dia': '10' });
      ww.configmaps.push(cmx); say('configmap/tlx-profile created', 'ok');
      ww.secrets.push(secret('tlx-dbcreds', ['DB_USER', 'DB_PASSWORD', 'SSFS_KEY'])); say('secret/tlx-dbcreds created', 'ok');
      const h = statefulset('tlx-hana', { replicas: 2 });
      ww.statefulsets.push(h); say('statefulset.apps/tlx-hana created  (HANA: stable identity + PVC per pod)', 'ok');
      const hire = pvc('tlx-hana-data', '200Gi');
      ww.pvcs.push(hire); say('persistentvolumeclaim/tlx-hana-data created  (200Gi — Bound)', 'ok');
      const asc = statefulset('tlx-ascs', { replicas: 1, image: 'reg.translogix.io/ascs:7.50' });
      ww.statefulsets.push(asc); say('statefulset.apps/tlx-ascs created  (ASCS: stable identity and volumes)', 'ok');
      const d = deployment('tlx-aas', { replicas: 3 });
      d.envFrom = ['ConfigMap/tlx-profile', 'Secret/tlx-dbcreds'];
      ww.deployments.push(d); say('deployment.apps/tlx-aas created  (AAS: disposable, scalable, self-healing)', 'ok');
      ww.services.push(svc('tlx-sapms', { ports: '3300/TCP', age: '<5s' }));
      ww.services.push(svc('tlx-aas', { ports: '8000/TCP', age: '<5s' }));
      say('service/tlx-sapms created  (logon load balancing)', 'ok');
      say('service/tlx-aas created  (internal AAS directory)', 'ok');
      say('ingress.networking.k8s.io/tlx-web created  (Fiori Launchpad exposed to the web)', 'ok');
      for (let i = 0; i < 3; i++) {
        const p = podForDep(w, d, {});
        schedule(w, 1400 + i * 600, () => { if (p.phase === 'Pending') { p.phase = 'Running'; p.ready = '1/1'; } });
      }
      schedule(w, 2600, () => {
        ww.narr.push({ cls: 'ok', t: '✅ TLX is online: PAS up, HANA primary + secondary, 3 AAS, sapms routed, web exposed' });
      });
    };
    return w;
  });

  /* 8.2 — production TXP */
  reg('prodLab', () => {
    const w = blank(); addCluster(w, 4); w.ns = 'txp';
    const d = deployment('txp-aas', { replicas: 4 });
    d.envFrom = ['ConfigMap/txp-profile', 'Secret/txp-dbcreds'];
    w.deployments.push(d);
    const b = deployment('txp-btc', { replicas: 6, container: 'btc-proc' });
    b.envFrom = ['ConfigMap/txp-profile', 'Secret/txp-dbcreds'];
    w.deployments.push(b);
    w.configmaps.push(cm('txp-profile', { 'rdisp/wp_no_dia': '12' }, '12d'));
    w.secrets.push(secret('txp-dbcreds', ['DB_USER', 'DB_PASSWORD'], '12d'));
    for (let i = 0; i < 4; i++) makeRunning(w, d, { metrics: { cpu: '210m', mem: '3.4Gi' } });
    for (let i = 0; i < 6; i++) {
      const p = makeRunning(w, b, { metrics: { cpu: i === 3 ? '950m' : '95m', mem: '1.4Gi' } });
      p.logs = i === 3 ? [
        { lvl: '', t: '[btc] job ZPAIE_EXTRACTIONS_FULL running (SM37-like)' },
        { lvl: 'WARN', t: '[btc] query: full table scan BFIT — 41M rows, repeated hits on the HANA PRIMARY' }
      ] : [{ lvl: '', t: '[btc] background jobs: normal flow' }];
    }
    w.services.push(svc('txp-aas', { ports: '8000/TCP 3200/TCP', age: '12d' }));
    logEvent(w, 'statefulset/txp-hana', 'Warning', 'CPUHigh', 'HANA PRIMARY CPU: 95% (the load comes from an external pod)', '31s');
    return w;
  });

  /* ===================================================================
     MOTEUR kubectl
     =================================================================== */
  /* Sortie partagée : say() reflète chaque ligne ici, pour les handlers
     qui construisent leur résultat via le say de exec mais renvoient lines: [] */
  let OUT = [];

  function execRaw(w, input) {
    OUT = [];
    const L = [];
    const say = (t, cls) => { const o = { t: t == null ? '' : String(t), cls: cls || 'out' }; L.push(o); OUT.push(o); };
    const cmd = String(input || '').trim().replace(/\s+/g, ' ');
    if (!cmd) return { ok: true, lines: L };
    if (/^(help|\?|aide)$/i.test(cmd)) { helpline(say); return { ok: true, lines: L }; }
    if (/^clear$/i.test(cmd)) return { clear: true, lines: L };
    if (!/^kubectl\b/i.test(cmd)) {
      say('Cette console ne sait exécuter que « kubectl … ». Tapez « help ».', 'err');
      return { ok: false, lines: L };
    }
    const sub = cmd.replace(/^kubectl\s+/i, '');
    let m;

    if ((m = sub.match(/^get\s+(\S+)(?:\s+(\S+))?(.*)$/i))) {
      const res = m[1].toLowerCase();
      const nameArg = m[2] && !/^-/.test(m[2]) ? m[2] : '';
      const R = {
        'pods': 'pods', 'pod': 'pods', 'nodes': 'nodes', 'node': 'nodes', 'no': 'nodes',
        'deployments': 'deps', 'deployment': 'deps', 'deploy': 'deps',
        'services': 'svcs', 'service': 'svcs', 'svc': 'svcs',
        'configmaps': 'cms', 'configmap': 'cms', 'cm': 'cms',
        'secrets': 'secrets', 'secret': 'secrets',
        'pvc': 'pvcs', 'persistentvolumeclaims': 'pvcs', 'persistentvolumeclaim': 'pvcs',
        'pv': 'pvs', 'persistentvolumes': 'pvs', 'persistentvolume': 'pvs',
        'statefulsets': 'sts', 'statefulset': 'sts', 'sts': 'sts',
        'hpa': 'hpas', 'horizontalpodautoscalers': 'hpas', 'horizontalpodautoscaler': 'hpas',
        'namespaces': 'ns', 'namespace': 'ns', 'ns': 'ns',
        'storageclass': 'sc', 'storageclasses': 'sc', 'sc': 'sc',
        'events': 'ev', 'event': 'ev', 'ev': 'ev', 'all': 'all'
      }[res];
      if (!R) { say("error: the server doesn't have a resource type « " + res + " »", 'err'); return { ok: false, lines: L }; }
      return getRes(w, R, nameArg, say);
    }

    if ((m = sub.match(/^describe\s+(pod|pods|po|node|nodes|svc|service|services|deploy|deployment|deployments|cm|configmap|configmaps|secret|secrets|pvc|persistentvolumeclaim|persistentvolumeclaims|sts|statefulset|statefulsets)(?:\s+([^-\s][^\s]*))?/i))) {
      const map = { pod: 'pod', pods: 'pod', po: 'pod', node: 'node', nodes: 'node', svc: 'svc', service: 'svc', services: 'svc', deploy: 'dep', deployment: 'dep', deployments: 'dep', cm: 'cm', configmap: 'cm', configmaps: 'cm', secret: 'secret', secrets: 'secret', pvc: 'pvc', persistentvolumeclaim: 'pvc', persistentvolumeclaims: 'pvc', sts: 'sts', statefulset: 'sts', statefulsets: 'sts' };
      const K = map[m[1].toLowerCase()];
      /* le joueur colle souvent le « … » du TP : on le nettoie en gardant le tiret du préfixe */
      const rawName = (m[2] || '');
      const endsPlaceholder = /[…]$|\.{2,}$/.test(rawName.trim());
      let name = rawName.replace(/[…]+/g, '').replace(/\.{2,}/g, '').trim();
      if (!endsPlaceholder) name = name.replace(/-+$/, '').trim();
      if (!name) {
        const col = { pod: w.pods, node: w.nodes, svc: w.services, dep: w.deployments, cm: w.configmaps, secret: w.secrets, pvc: w.pvcs, sts: w.statefulsets }[K];
        say('error: il faut un nom — « kubectl describe ' + m[1].toLowerCase() + ' <nom> »', 'err');
        if (col) say('disponibles : ' + (col.map(x => x.name).join(', ') || '(aucun)'), 'muted');
        return { ok: false, lines: L };
      }
      return describeRes(w, K, name, say);
    }

    if ((m = sub.match(/^logs\s+(?:-f\s+)?([^\s]+)/i))) {
      let p = w.pods.find(x => x.name === m[1]);
      if (!p) {
        const cands = w.pods.filter(x => x.name.indexOf(m[1]) === 0);
        if (cands.length) p = cands.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
      }
      if (!p) { say('Error from server (NotFound): pods "' + m[1] + '" not found', 'err'); say('pods disponibles : ' + (w.pods.map(x => x.name).join(', ') || '(aucun)'), 'muted'); return { ok: false, lines: L }; }
      say('== logs : ' + p.name + ' ==', 'muted');
      (p.logs || []).forEach(l => say(l.t, (l.lvl || '').indexOf('ERR') >= 0 ? 'logERR' : (l.lvl || '').indexOf('WARN') >= 0 ? 'logWARN' : l.lvl === 'INFO' ? 'out' : 'acc'));
      if (!(p.logs || []).length) say('(aucun log)');
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^delete\s+pod(s)?\s+([^\s]+)/i))) {
      let p = w.pods.find(x => x.name === m[2]);
      if (!p) {
        const cands = w.pods.filter(x => x.name.indexOf(m[2]) === 0);
        if (cands.length) p = cands.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
      }
      if (!p) { say('Error from server (NotFound): pods "' + m[2] + '" not found', 'err'); say('pods disponibles : ' + (w.pods.map(x => x.name).join(', ') || '(aucun)'), 'muted'); return { ok: false, lines: L }; }
      p.phase = 'Terminating'; p.terminateAt = Date.now() + 900;
      say('pod "' + p.name + '" deleted (arrêt gracieux en cours…)', 'ok');
      logEvent(w, 'pod/' + p.name, 'Normal', 'Killing', 'Suppression du pod (grace period)', '<5s');
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^apply\s+-f\s+([^\s]+)/i))) {
      const f = w.files[m[1]];
      if (!f) {
        say('error: le fichier « ' + m[1] + ' » n est pas fourni par ce TP.', 'err');
        say('Fichiers disponibles : ' + (Object.keys(w.files).join(', ') || '(aucun)'), 'muted');
        return { ok: false, lines: L };
      }
      say('');
      f(w, say);
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^run\s+([^\s]+)\s+--?image=([^ ]+)(.*)$/i))) {
      const name = m[1];
      if (w.pods.find(x => x.name === name)) {
        say('Error from server (AlreadyExists): pods "' + name + '" already exists', 'err');
        return { ok: false, lines: L };
      }
      const p = pod({
        name, ns: w.ns, node: pickNode(w),
        owner: { kind: 'Pod', name }, image: m[2],
        phase: 'Pending', labels: { run: name },
        logs: [{
          lvl: '', t: 'SAP NetWeaver Application Server 7.50 SP22 — starting'
        }]
      });
      p.pendingUntil = Date.now() + 1300;
      p.logs = [
        { lvl: '', t: 'SAP NetWeaver Application Server 7.50 SP22 — starting' },
        { lvl: 'INFO', t: '[ms] Message Server listening on 3900 ✔' },
        { lvl: 'INFO', t: '[disp] work processes ⇒ DIA 10 · BTC 6 · SPO 2 · UP 2' },
        { lvl: 'INFO', t: '[icm] HTTP active on 8000 ✔' },
        { lvl: '', t: 'Instance operational in 52 s' }
      ];
      // les images nwas démarrent « seules » (simulation) : l instance tourne après quelques secondes
      w.pods.push(p);
      schedule(w, 1500, () => { if (p.phase === 'Pending') { p.phase = 'Running'; p.ready = '1/1'; logEvent(w, 'pod/' + name, 'Normal', 'Started', 'Container started'); } });
      say('pod/' + name + ' created', 'ok');
      logEvent(w, 'pod/' + name, 'Normal', 'Scheduled', 'Successfully assigned to ' + p.node, '<5s');
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^scale\s+(?:deployments?\s+|deployment\.apps\/|deploy\/|deployment\/|deploy\s+|deployments\/)([^\s]+)\s+--replicas=(\d+)/i))) {
      const d = w.deployments.find(x => x.name === m[1]);
      if (!d) { say('Error from server (NotFound): deployments.apps "' + m[1] + '" not found', 'err'); return { ok: false, lines: L }; }
      d.replicas = parseInt(m[2], 10);
      say('deployment.apps/' + d.name + ' scaled (replicas: ' + d.replicas + ')', 'ok');
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^set\s+image\s+(?:deployments?(?:\.apps)?\/|deployments?\s+)([^\s]+)\s+([^=]+)=(\S+)/i))) {
      const d = w.deployments.find(x => x.name === m[1]);
      if (!d) { say('Error from server (NotFound): deployments.apps "' + m[1] + '" not found', 'err'); return { ok: false, lines: L }; }
      setImg(w, d, m[3], say);
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^rollout\s+(status|undo|history)\s+(?:deployments?(?:\.apps)?\/|deployments?\s+)([^\s]+)/i))) {
      const d = w.deployments.find(x => x.name === m[2]);
      if (!d) { say('Error from server (NotFound): deployments.apps "' + m[2] + '" not found', 'err'); return { ok: false, lines: L }; }
      return rollout(w, d, m[1].toLowerCase(), say);
    }

    if (/^top\s+pods?/i.test(sub)) {
      say('');
      const rows = w.pods.filter(p => p.phase === 'Running')
        .map(p => [p.name, (p.metrics && p.metrics.cpu) || '120m', (p.metrics && p.metrics.mem) || '1.2Gi']);
      if (!rows.length) say('No resources found', 'muted');
      else fmtTable(['NAME', 'CPU(cores)', 'MEMORY(bytes)'], rows).forEach(t => say(t, 'tbl'));
      return { ok: true, lines: L };
    }

    if ((m = sub.match(/^exec\s+(?:-it\s+|-it|-i\s+-t\s+)?([^\s]+)\s+--\s+(.+)$/i))) {
      let p = w.pods.find(x => x.name === m[1]);
      if (!p) {
        const cands = w.pods.filter(x => x.name.indexOf(m[1]) === 0);
        if (cands.length === 1) p = cands[0];
        else if (cands.length > 1) { say('Error: le nom "' + m[1] + '" est ambigu (préfixe de plusieurs pods) — précisez-le', 'err'); return { ok: false, lines: L }; }
      }
      if (!p) { say('Error from server (NotFound): pods "' + m[1] + '" not found', 'err'); say('pods disponibles : ' + (w.pods.map(x => x.name).join(', ') || '(aucun)'), 'muted'); return { ok: false, lines: L }; }
      return execIn(w, p, m[2], say);
    }

    if (/^version/i.test(sub)) {
      say('Client Version: v1.31.4 (simulation pédagogique)', 'muted');
      return { ok: true, lines: L };
    }

    say('Syntaxe non gérée : « kubectl ' + sub + ' »', 'err');
    say('Consultez « help » pour la liste des commandes du TP.', 'muted');
    return { ok: false, lines: L };
  }

  function getRes(w, R, name, say) {
    say('');
    switch (R) {
      case 'pods': {
        if (name) {
          const p = w.pods.find(x => x.name === name);
          if (!p) { say('Error from server (NotFound): pods "' + name + '" not found', 'err'); return { ok: false, lines: [] }; }
          yamlPod(p, say);
          return { ok: true, lines: [] };
        }
        if (!w.pods.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', 'IP', 'NODE'],
          w.pods.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p =>
            [p.name, p.phase === 'Running' ? '1/1' : '0/1', statusOf(p), p.restarts, p.age, p.node ? p.ip : '<none>', p.node || '<none>']))
          .forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'nodes': {
        const list = name ? w.nodes.filter(n => n.name === name) : w.nodes;
        if (!list.length) { say('Error from server (NotFound): nodes "' + name + '" not found', 'err'); return { ok: false, lines: [] }; }
        fmtTable(['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
          list.map(n => [n.name, n.status, n.role, '31d', n.version])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'deps': {
        const list = name ? w.deployments.filter(d => d.name === name) : w.deployments;
        if (!list.length) {
          say(name ? 'Error from server (NotFound): deployments.apps "' + name + '" not found' : 'No resources found in ' + w.ns + ' namespace.', 'muted');
          return { ok: true, lines: [] };
        }
        fmtTable(['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
          list.map(d => [d.name, d.ready + '/' + d.replicas, d.replicas, d.ready, d.cAge])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'svcs': {
        const list = name ? w.services.filter(s => s.name === name) : w.services;
        if (!list.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'TYPE', 'CLUSTER-IP', 'PORT(S)', 'AGE'],
          list.map(s => [s.name, s.type, s.clusterIP, s.ports, s.age])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'cms': {
        if (!w.configmaps.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'DATA', 'AGE'], w.configmaps.map(c => [c.name, Object.keys(c.data).length, c.age])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'secrets': {
        if (!w.secrets.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'TYPE', 'DATA', 'AGE'], w.secrets.map(s => [s.name, 'Opaque', s.keys.length, s.age])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'pvcs': {
        if (!w.pvcs.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'STORAGECLASS', 'AGE'],
          w.pvcs.map(x => [x.name, x.phase, x.volume, x.size, x.sc, x.age])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'pvs': {
        if (!w.pvcs.length) { say('No resources found', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'CAPACITY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'AGE'],
          w.pvcs.map(x => [x.volume, x.size, 'Bound', w.ns + '/' + x.name, x.sc, '1m'])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'sts': {
        if (!w.statefulsets.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'READY', 'AGE'],
          w.statefulsets.map(s => [s.name, s.ready + '/' + s.replicas, s.cAge])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'hpas': {
        if (!w.hpas.length) { say('No resources found in ' + w.ns + ' namespace.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS'],
          w.hpas.map(h => [h.name, 'deployment/' + h.ref, h.load + '%/' + h.cpuTarget + '%', h.min, h.max, h.replicas]))
          .forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'ns': {
        fmtTable(['NAME', 'STATUS', 'AGE'], [
          ['default', 'Active', '31d'], ['kube-node-lease', 'Active', '31d'],
          ['kube-public', 'Active', '31d'], ['kube-system', 'Active', '31d'], ['tlx', 'Active', '31d']
        ]).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'sc': {
        if (!w.sc) { say('No resources found', 'muted'); return { ok: true, lines: [] }; }
        say('NAME       PROVISIONER    DEFAULT   AGE', 'tbl');
        say('fast-ssd   azure-disk     *         31d', 'tbl');
        return { ok: true, lines: [] };
      }
      case 'ev': {
        if (!w.events.length) { say('No events.', 'muted'); return { ok: true, lines: [] }; }
        fmtTable(['TYPE', 'REASON', 'OBJECT', 'MESSAGE', 'AGE'],
          w.events.slice(0, 14).map(e => [e.type, e.reason, e.obj, e.message, e.age])).forEach(t => say(t, 'tbl'));
        return { ok: true, lines: [] };
      }
      case 'all': {
        if (w.deployments.length) {
          say('=== deployments ===', 'head');
          fmtTable(['NAME', 'READY', 'IMAGE'], w.deployments.map(d => [d.name, d.ready + '/' + d.replicas, d.image])).forEach(t => say(t, 'tbl'));
        }
        if (w.pods.length) {
          say(''); say('=== pods ===', 'head');
          fmtTable(['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'],
            w.pods.map(p => [p.name, p.phase === 'Running' ? '1/1' : '0/1', statusOf(p), p.restarts, p.age])).forEach(t => say(t, 'tbl'));
        }
        if (w.services.length) {
          say(''); say('=== services ===', 'head');
          fmtTable(['NAME', 'TYPE', 'CLUSTER-IP', 'PORT(S)', 'AGE'],
            w.services.map(s => [s.name, s.type, s.clusterIP, s.ports, s.age])).forEach(t => say(t, 'tbl'));
        }
        if (w.configmaps.length || w.secrets.length) {
          say(''); say('=== config ===', 'head');
          (w.configmaps.map(c => 'configmap/' + c.name)).concat(w.secrets.map(s => 'secret/' + s.name))
            .forEach(t => say(t));
        }
        if (!w.deployments.length && !w.pods.length && !w.services.length && !w.configmaps.length) say('No resources found.', 'muted');
        return { ok: true, lines: [] };
      }
    }
    return { ok: true, lines: [] };
  }

  function statusOf(p) {
    if (p.phase === 'Pending') return p.pendingReason ? 'Pending' : 'ContainerCreating';
    return p.phase;
  }
  function yamlPod(p, say) {
    say('apiVersion: v1');
    say('kind: Pod');
    say('metadata:');
    say('  name: ' + p.name);
    say('  namespace: ' + p.ns);
    say('  labels: ' + Object.entries(p.labels).map(([k, v]) => k + '=' + v).join(', '));
    say('spec:');
    say('  containers:');
    say('  - name: ' + (p.containers.split(/\s/)[0] || 'nwas'));
    say('    image: ' + p.image);
    if (p.envFrom.length) say('    envFrom: ' + p.envFrom.join(', '));
    say('  nodeName: ' + (p.node || ''));
    say('status:');
    say('  phase: ' + p.phase);
    say('  podIP: ' + p.ip);
  }

  function describeRes(w, K, name, say) {
    say('');
    /* introuvable → indice : le nom appartient peut-être à un autre type d objet */
    function notFound(label) {
      say(label + ' "' + name + '" introuvable', 'err');
      [[w.deployments, 'deployment'], [w.pods, 'pod'], [w.services, 'service'], [w.statefulsets, 'statefulset'], [w.configmaps, 'configmap'], [w.secrets, 'secret'], [w.pvcs, 'pvc']].forEach(([arr, minK]) => {
        if (minK !== K && arr.some(x => x.name === name)) {
          say('⚠ "' + name + '" existe comme <b>' + minK + '</b> : essayez « kubectl describe ' + minK + ' ' + name + ' »', 'warn');
        }
      });
      const lists = { pod: [w.pods, 'pods'], node: [w.nodes, 'nodes'], svc: [w.services, 'services'], dep: [w.deployments, 'deployments'], cm: [w.configmaps, 'configmaps'], secret: [w.secrets, 'secrets'], pvc: [w.pvcs, 'pvcs'], sts: [w.statefulsets, 'statefulsets'] };
      const [arr, lbl] = lists[K] || [null, null];
      if (arr) say(lbl + ' disponibles : ' + (arr.map(x => x.name).join(', ') || '(aucun)'), 'muted');
      return { ok: false, lines: [] };
    }
    if (K === 'pod') {
      let p = w.pods.find(x => x.name === name);
      if (!p) {
        const cands = w.pods.filter(x => x.name.indexOf(name) === 0);
        if (cands.length) p = cands.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
      }
      if (!p) return notFound('pods');
      descPod(p, say);
      return { ok: true, lines: [] };
    }
    if (K === 'node') {
      const n = w.nodes.find(x => x.name === name);
      if (!n) {
        const cands = w.nodes.filter(x => x.name.indexOf(name) === 0);
        if (cands.length !== 1) return notFound('nodes');
        descNode(w, cands[0], say);
        return { ok: true, lines: [] };
      }
      descNode(w, n, say);
      return { ok: true, lines: [] };
    }
    if (K === 'svc') {
      let sv = w.services.find(x => x.name === name);
      if (!sv) {
        const cands = w.services.filter(x => x.name.indexOf(name) === 0);
        if (cands.length === 1) sv = cands[0];
      }
      if (!sv) return notFound('services');
      descSvc(w, sv, say);
      return { ok: true, lines: [] };
    }
    if (K === 'dep') {
      let d = w.deployments.find(x => x.name === name);
      if (!d) {
        const cands = w.deployments.filter(x => x.name.indexOf(name) === 0);
        if (cands.length === 1) d = cands[0];
      }
      if (!d) return notFound('deployment');
      descDep(w, d, say);
      return { ok: true, lines: [] };
    }
    if (K === 'cm') {
      const c = w.configmaps.find(x => x.name === name);
      if (!c) return notFound('configmap');
      say('Name:    ' + c.name);
      say('Data (' + Object.keys(c.data).length + ') :');
      Object.entries(c.data).forEach(([k, v]) => say('  ' + k + ': ' + v));
      return { ok: true, lines: [] };
    }
    if (K === 'secret') {
      const s = w.secrets.find(x => x.name === name);
      if (!s) return notFound('secret');
      say('Name:   ' + s.name);
      say('Type:   Opaque');
      say('Data (valeurs masquées par design) :');
      s.keys.forEach(k => say('  ' + k + ': ******'));
      return { ok: true, lines: [] };
    }
    if (K === 'pvc') {
      const x = w.pvcs.find(z => z.name === name);
      if (!x) return notFound('pvc');
      say('Name:          ' + x.name);
      say('StorageClass:  ' + x.sc);
      say('Capacity:      ' + x.size);
      say('Volume:        ' + x.volume);
      say('Status:        ' + x.phase);
      return { ok: true, lines: [] };
    }
    if (K === 'sts') {
      const s = w.statefulsets.find(x => x.name === name);
      if (!s) { say('statefulset "' + name + '" introuvable', 'err'); return { ok: false, lines: [] }; }
      say('Name:        ' + s.name);
      say('Replicas:    ' + s.ready + ' / ' + s.replicas);
      say('Image:       ' + s.image);
      say('Volumes:     ' + s.claims[0].name + '-<pod> (' + s.claims[0].size + ' par pod, dédiés)');
      say('Identité:    pod n°X s appelle TOUJOURS ' + s.name + '-X, même après redémarrage');
      return { ok: true, lines: [] };
    }
    say('describe de cette ressource n est pas simulé', 'muted');
    return { ok: false, lines: [] };
  }

  function descPod(p, say) {
    say('Name:             ' + p.name);
    say('Namespace:        ' + p.ns);
    say('Status:           ' + (p.phase === 'OOMKilled' ? 'Terminé (Reason: OOMKilled · Exit Code 137)' : p.phase));
    if (p.phase === 'OOMKilled') say('Restart Count:    ' + p.restarts);
    say('IP:               ' + (p.node ? p.ip : '<none>'));
    if (p.node) say('Node:             ' + p.node + '/' + nodeIP(p.node));
    say('Controlled By:    ' + (p.owner.kind === 'ReplicaSet' ? 'ReplicaSet/' + p.owner.name : p.owner.kind === 'StatefulSet' ? 'StatefulSet/' + p.owner.name : '—'));
    say('Labels:           ' + Object.entries(p.labels).map(([k, v]) => k + '=' + v).join(', '));
    say('');
    say('⚠ Sections clés :', 'head');
    say('  Image:          ' + p.image);
    if (p.envFrom.length) say('  Env depuis:     ' + p.envFrom.join(' · '));
    (p.probes || []).forEach(pr => say('  Probe:          ' + pr));
    say('  Requests:       cpu: ' + Math.round(p.reqCpu * 1000) + 'm / mem: ' + (p.reqMem >= 1024 ? (p.reqMem / 1024) + 'Gi' : p.reqMem + 'Mi'));
    say('  Limits:         mem: ' + (p.limMem >= 1024 ? (p.limMem / 1024) + 'Gi' : p.limMem + 'Mi'));
    (p.mounts || []).forEach(mt => say('  Montage:        ' + mt));
    if (p.phase === 'OOMKilled') say('  ⚠ OOMKilled (137) : la limite mémoire a été franchie', 'logWARN');
    if (p.pendingReason) say('  ☐ Non planifié : ' + p.pendingReason, 'logWARN');
    if (p.phase === 'CrashLoopBackOff') say('  ⟲ Redémarre en boucle — lisez Logs & Events', 'logWARN');
    if (p.phase === 'ImagePullBackOff') say('  ⟲ L image ne peut pas être téléchargée', 'logWARN');
    say('');
    say('Events :', 'head');
    const evs = (p.events && p.events.length) ? p.events : [{ type: 'Normal', reason: 'Started', message: 'Conteneur démarré par le kubelet', age: p.age }];
    fmtTable(['TYPE', 'REASON', 'AGE', 'MESSAGE'], evs.map(e => [e.type, e.reason, e.age, e.message])).forEach(t => say(t, 'tbl'));
  }
  function descNode(w, n, say) {
    say('Name:      ' + n.name);
    say('Status:    ' + n.status);
    say('Roles:     ' + (n.role === 'control-plane' ? 'control-plane (API + plan de contrôle, jamais de charge SAP)' : 'worker'));
    say('Version:   ' + n.version);
    say('Taints:    ' + (n.taints.length ? n.taints.join(', ') : '<none>'));
    say('');
    say('Ressources :', 'head');
    say('  cpu:                 ' + n.allocCpu + ' coeurs allouables');
    say('  memory:              ' + Math.round(n.allocMem / 1024) + 'Gi');
    const mine = w.pods.filter(p => p.node === n.name && (p.phase === 'Running' || p.phase === 'Pending' || p.phase === 'ImagePullBackOff'));
    const used = Math.min(Math.round((n.usedCpu + mine.reduce((a, p) => a + p.reqCpu, 0)) * 10) / 10, n.allocCpu);
    say('  CPU utilisé/réservé: ' + used + ' / ' + n.allocCpu + (used >= n.allocCpu - 0.6 ? '   ← SATURÉ' : ''));
    say('  pods affectés:       ' + mine.length);
  }
  function descSvc(w, sv, say) {
    say('Name:        ' + sv.name);
    say('Type:        ' + sv.type);
    say('ClusterIP:   ' + sv.clusterIP + '   (IP stable, DNS interne : ' + sv.name + '.tlx.svc)');
    say('Ports:       ' + sv.ports);
    say('Selector:    ' + Object.entries(sv.selector).map(([k, v]) => k + '=' + v).join(','));
    say('');
    say('Endpoints (pods raccordés) :', 'head');
    const eps = podsSec(w, sv.selector).filter(p => p.phase === 'Running' || p.phase === 'Pending');
    if (!eps.length) say('  <none>   ← aucun pod ne correspond au sélecteur !', 'err');
    else eps.forEach(p => say('  ' + p.ip + ':' + (sv.ports.split('/')[0] || '8000') + '   (' + p.name + ')'));
  }
  function descDep(w, d, say) {
    say('Name:         ' + d.name);
    say('Réplicas:     ' + d.ready + ' ready / ' + d.replicas + ' souhaités');
    say('Image:        ' + d.image);
    say('Stratégie:    ' + d.strategy + ' (maxSurge ' + d.maxSurge + ', maxUnavailable ' + d.maxUnavailable + ')');
    if (d.envFrom.length) say('Config:       ' + d.envFrom.join(' · '));
    (d.probes || []).forEach(pr => say('Probe:        ' + pr));
    say('Requests:     ' + d.requestsTxt);
    say('Limits:       ' + d.limitsTxt);
    if (d.brokenImage) say('⚠ l image « ' + d.image + ' » est introuvable : les pods restent en ImagePullBackOff', 'logERR');
  }

  function setImg(w, d, img, say) {
    d.prevImage = d.image;
    d.image = img;
    d.rsHash = b36(4) + '9';
    d.gen++;
    d.rolling = true;
    d.brokenImage = /(:?7\.51|:7\.99|sp99|broken|:nope|latest-bad)/.test(img);
    say('deployment.apps/' + d.name + ' image updated  (' + img + ')', 'ok');
    if (d.brokenImage) {
      logEvent(w, 'deployment/' + d.name, 'Warning', 'ErrImagePull', 'Image "' + img + '" not found in the registry', '4s');
      say('⚠ ce tag semble inexistant : le rollout va rester bloqué (essayez « kubectl rollout status … »)', 'warn');
    } else {
      say('→ le ReplicaSet remplace progressivement les pods (rolling update)', 'acc');
    }
  }
  function rollout(w, d, act, say) {
    if (act === 'status') {
      const mine = w.pods.filter(p => p.owner.kind === 'ReplicaSet' && p.owner.name.indexOf(d.name) === 0);
      const bad = mine.filter(p => p.phase === 'ImagePullBackOff');
      if (bad.length) {
        say('Waiting for rollout to finish: ' + bad.length + ' of ' + d.replicas + ' updated pods are ready…');
        say('error: deployment "' + d.name + '" bloqué — image "' + d.image + '" introuvable', 'err');
        say('(annulez avec : kubectl rollout undo deployment/' + d.name + ')', 'muted');
        return { ok: false, lines: [] };
      }
      const notReady = mine.filter(p => p.phase !== 'Running' || p.rsGen !== d.gen);
      if (notReady.length) {
        say('Waiting for rollout to finish: ' + notReady.length + ' pods restants à remplacer…');
        say('(les readiness probes conditionnent chaque bascule de trafic)', 'muted');
        return { ok: false, lines: [], keepTrying: true };
      }
      say('deployment "' + d.name + '" successfully rolled out', 'ok');
      return { ok: true, lines: [] };
    }
    if (act === 'undo') {
      if (!d.prevImage) { say('aucun historique à annuler', 'muted'); return { ok: false, lines: [] }; }
      const prev = d.prevImage;
      d.image = prev; d.rsHash = b36(4) + 'b'; d.gen++; d.brokenImage = false;
      w.pods.forEach(p => {
        if (p.owner.kind === 'ReplicaSet' && p.owner.name.indexOf(d.name) === 0 && p.phase === 'ImagePullBackOff') {
          p.phase = 'Terminating'; p.terminateAt = Date.now() + 400;
        }
      });
      say('deployment.apps/' + d.name + ' rolled back  (' + prev + ')', 'ok');
      logEvent(w, 'deployment/' + d.name, 'Normal', 'Rollback', 'Retour à l image ' + prev, '3s');
      return { ok: true, lines: [] };
    }
    say('REVISION   CHANGE-CAUSE');
    say('1          déploiement initial');
    say('2          ' + d.prevImage);
    if (d.gen > 2) say('3          ' + d.image);
    return { ok: true, lines: [] };
  }

  function execIn(w, p, cmdRest, say) {
    const c = cmdRest.trim();
    let m;
    if ((m = c.match(/^curl\s+(?:-s\s+)?(http:\/\/[^\/\s]+)(?:\/\S*)?(?:\s|$)/))) {
      const host = m[1].replace(/^http:\/\//, '').split(':')[0];
      const target = w.services.find(s => s.name === host);
      if (!target) { say('curl: (7) Failed to connect — nom de service inconnu dans le DNS interne', 'logERR'); return { ok: false, lines: [] }; }
      const eps = podsSec(w, target.selector).filter(x => x.phase === 'Running');
      if (!eps.length) { say('curl: (7) connection refused — le service a 0 endpoints', 'logERR'); return { ok: false, lines: [] }; }
      const resp = eps[Math.floor(Math.random() * eps.length)];
      say('HTTP/1.1 200 OK');
      say('répondu par : ' + resp.name + '  ← le Service a réparti la requête aléatoirement ✔');
      return { ok: true, lines: [] };
    }
    if (/^hostname\s+-i/.test(c)) { say(p.ip); return { ok: true, lines: [] }; }
    if (/^env/.test(c)) {
      p.envFrom.forEach(e => say('# injecté depuis ' + e));
      say('SAPSYSTEM=00  SAPSYSTEMNAME=TLX  rdisp/wp_no_dia=10');
      return { ok: true, lines: [] };
    }
    say('OCI runtime exec: commande « ' + c + ' » non simulée', 'muted');
    return { ok: false, lines: [] };
  }

  function helpline(say) {
    say('Commandes disponibles dans ce TP :', 'head');
    [
      '  kubectl get pods|nodes|deployments|services|events|all',
      '  kubectl describe pod|node|deployment|service|cm|secret|pvc <nom>',
      '  kubectl logs <pod>                 (équivalent SM21)',
      '  kubectl delete pod <nom>           (tester la résurrection)',
      '  kubectl apply -f <fichier.yml>     (fichiers fournis par le TP)',
      '  kubectl scale deployment <n> --replicas=N',
      '  kubectl set image deployment/<n> nwas=<image>',
      '  kubectl rollout status|undo deployment/<n>',
      '  kubectl top pods                   (équivalent ST06)',
      '  kubectl exec -it <pod> -- curl http://<svc>:<port>/…',
      '  help · clear'
    ].forEach(t => say(t, 'acc'));
  }

  function exec(w, input) {
    OUT = [];
    const r = execRaw(w, input);
    if ((r.lines || []).length === 0 && OUT.length) r.lines = OUT;
    return r;
  }

  return {
    blank, tick, exec, schedule,
    create(id) { const f = factories[id] || factories['empty']; return f(); },
    removePod
  };
})();

if (typeof module !== 'undefined') module.exports = W;
