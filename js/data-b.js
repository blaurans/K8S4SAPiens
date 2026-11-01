'use strict';
/* =====================================================================
   data-b.js — Chapters 5 to 8 + glossary + badges + tracks
   Depends on data-a.js (MISSIONS_A, EQMAP) and world.js (W).
   ===================================================================== */

/* ---------- Logbook definitions ---------- */
const GLOSS = {
  'Node': 'A server (physical or VM) that provides CPU/RAM/disk. Workloads move from one Node to another without you lifting a finger.',
  'Control plane': 'The conductor: schedules Pods, monitors, recreates. Runs on its own Nodes, never hosts any SAP workload.',
  'Cluster': 'The whole operating unit: Nodes + control plane. The unit of operation is now the cluster, not the server.',
  'Namespace': 'Walls between names and permissions. Airbus recommendation: one namespace per SID (TLX, TXP…).',
  'kubectl': 'The single Kubernetes console. 90% of your daily work: get, describe, logs, apply.',
  'Pod': 'The smallest deployable unit: the equivalent of an SAP instance (PAS/AAS). Disposable by design.',
  'Image': 'Immutable package containing binaries + runtime (no data). Versioned in the registry.',
  'Container': 'An isolated process created from an image, driven by the Pod. In short: a packaged work process.',
  'Deployment': 'Declares "N replicas of this image" — the orchestrator does the rest (scaling, rolling update).',
  'ReplicaSet': 'The Deployment executor: maintains the replica count, resurrects whatever disappears.',
  'Self-healing': 'Automatic drift correction: pod killed → recreated. Your Pacemaker, cloud edition, built in.',
  'Service': 'Stable IP + internal DNS + load balancing across ready pods. The modernized message server / VIP.',
  'Ingress': 'HTTP/HTTPS routing by host and path, TLS included. The Fiori Launchpad facing the web.',
  'Endpoint': 'List of pods actually wired to a Service. Automatically keeps up with births and deaths.',
  'Internal DNS': 'Every Service has a name: <svc>.<namespace>.svc — genuine v-hosts with no DNS entry to plan for.',
  'PersistentVolume': 'The real disk provisioned by the cluster: your SAN/NFS, which will outlive the Pods.',
  'PVC': "The Pod's reservation ('200Gi'). Plugs into the Pod and outlives its lifecycle.",
  'StorageClass': 'A storage recipe (SSD, block, NFS): dynamically manufactures PVs.',
  'StatefulSet': 'Numbered pods (name-0, name-1…), a dedicated PVC per pod, ordered startup: HANA, ASCS.',
  'Stable identity': 'A StatefulSet pod is always reborn under the same name, with its volume: nothing to re-identify.',
  'HPA': 'Horizontal Pod Autoscaler: a CPU/RAM rule → the cluster adds/removes replicas on its own.',
  'Requests/Limits': 'Requests = guaranteed reservation (used for Pod placement); Limit = hard ceiling (beyond it: SIGKILL).',
  'OOMKilled': 'The kernel killed a container (exit 137): the memory limit was crossed. No swap in Kubernetes.',
  'Rolling update': 'Progressive pod replacement (V N → N+1) with zero downtime, guarded by readiness probes.',
  'Readiness/Liveness': 'Readiness: cut from traffic if not ready. Liveness: restarted if dead. Your automated instance checks.',
  'CrashLoopBackOff': 'Restart loop. First investigation: kubectl logs + describe (events).',
  'ImagePullBackOff': 'The image cannot be pulled: wrong tag, registry unavailable, or permissions.',
  'Pending': 'The pod is waiting for a free spot: insufficient CPU/RAM, scheduling constraint. describe will tell you everything.',
  'kubectl logs / SM21': 'Per-container log streams, in real time, exportable to ELK/Prometheus.',
  'Jobs': 'Job / CronJob: the SM37 batches that are born, work and die.',
  'Replica (scale)': 'kubectl scale deployment <n> --replicas=N : the former "adding a dialog instance", in seconds.'
};

const BADGES = {
  'pod': { icon: '🥚', label: 'Papa Pod' },
  'pompiers': { icon: '🚒', label: 'Cluster Firefighter' },
  'gardien': { icon: '🛡️', label: 'Data Guardian' },
  'scaler': { icon: '📈', label: 'Orchestra Conductor' },
  'debug': { icon: '🐛', label: 'ST22 Retired' },
  'archi': { icon: '🏛️', label: 'TLX Architect' },
  'boss': { icon: '🏆', label: 'Certified Kube Basis' }
};

/* ---------- Tracks ---------- */
const TRACKS = [
  { id: 'essentiel', label: 'In 1 h', name: 'The Essentials',
    desc: 'Quick sprint: understand Pod, Deployment and Service, and get past your fear of the cluster. Lightning final quiz.',
    missions: ['c1m1', 'c1m2', 'c2m1', 'c3m1', 'c3m2', 'c5m1', 'c8m2'] },
  { id: 'standard', label: '2 h 30', name: 'The Full Magic',
    desc: 'Recommended: adds data (HANA), sizing (HPA, limits) and the zero-downtime rolling update.',
    missions: ['c1m1', 'c1m2', 'c2m1', 'c3m1', 'c3m2', 'c4m1', 'c4m2', 'c5m1', 'c5m2', 'c6m1', 'c8m2'] },
  { id: 'complet', label: '3 h 30', name: 'Certification',
    desc: 'Everything: + ConfigMaps/Secrets in depth and the debug envelope (5 incidents under real conditions).',
    missions: ['c1m1', 'c1m2', 'c2m1', 'c2m2', 'c3m1', 'c3m2', 'c4m1', 'c4m2', 'c5m1', 'c5m2', 'c6m1', 'c7m1', 'c8m1', 'c8m2'] }
];

/* ---------- Final boss question bank ---------- */
const QUIZ_BANK = [
  { tag: 'c1m1', q: 'The K8s equivalent of a "physical server":', opts: ['Pod', 'Node', 'Ingress'], ans: 1, pts: 10, why: 'Node: the machine that provides the resources.' },
  { tag: 'c1m1', q: 'Ideally at Airbus: one namespace per…', opts: ['Pod', 'SID', 'image'], ans: 1, pts: 10, why: 'One SID = one namespace (TLX, TXP…). Clean isolation.' },
  { tag: 'c1m2', q: 'The container image contains', opts: ['the kernel binaries, not the data', 'the client dumps', 'the DEFAULT.PFL profiles'], ans: 0, pts: 10, why: 'Immutable code. The data stays in volumes.' },
  { tag: 'c1m2', q: 'The tool for reading a pod\'s logs:', opts: ['kubectl logs', 'kubectl get svc', 'kubectl exec -s'], ans: 0, pts: 10, why: 'kubectl logs, the new SM21.' },
  { tag: 'c3m1', q: 'Who recreates a killed Pod, with no human intervention?', opts: ['The Deployment\'s ReplicaSet', 'Pacemaker', 'The DNS'], ans: 0, pts: 10, why: 'Native self-healing: the ReplicaSet keeps the count.' },
  { tag: 'c3m2', q: 'A stable DNS for pods whose IP keeps changing:', opts: ['Service', 'ConfigMap', 'Job'], ans: 0, pts: 10, why: 'Service: IP + DNS + load balancing to the ready pods.' },
  { tag: 'c2m2', q: 'The database passwords belong in a…', opts: ['ConfigMap', 'Secret', 'Deployment'], ans: 1, pts: 10, why: 'Secrets: masked, mounted at runtime.' },
  { tag: 'c2m2', q: 'After a ConfigMap apply, the running pods…', opts: ['reread it instantly', 'do nothing: a recreate/rollout is required', 'crash'], ans: 1, pts: 10, why: 'The config is read at startup: trigger a rollout to reread it.' },
  { tag: 'c4m1', q: 'Does HANA data survive the death of the Pod?', opts: ['Yes: a dedicated PVC/PV', 'No, it goes to the cloud', 'Only if there was a backup the night before'], ans: 0, pts: 10, why: 'The volume is independent of the Pod\'s lifecycle.' },
  { tag: 'c4m2', q: 'The best resource for HANA:', opts: ['Deployment', 'StatefulSet', 'CronJob'], ans: 1, pts: 10, why: 'Stable identity + dedicated PVC + startup order.' },
  { tag: 'c5m1', q: 'To absorb a logon peak, you:', opts: ['scale the Deployment (replicas)', 'rebuild the Service from scratch', 'create a Secret'], ans: 0, pts: 10, why: 'scale = the former "adding a dialog instance", in one second.' },
  { tag: 'c5m2', q: 'A pod dies: exit 137 (OOMKilled). The culprit:', opts: ['The memory limit', 'The DNS', 'The ConfigMap'], ans: 0, pts: 10, why: 'Memory limit exceeded: the kernel kills without a word.' },
  { tag: 'c6m1', q: 'Roll back instantly after a failed SP:', opts: ['kubectl rollout undo', 'restore a backup', 'reinstall'], ans: 0, pts: 10, why: 'Rollout undo: back to V-N in 10 seconds.' },
  { tag: 'c7m1', q: 'CrashLoopBackOff: first reflex:', opts: ['kubectl logs + describe (events)', 'restart the Node', 'inject a flush'], ans: 0, pts: 10, why: 'Logs + events almost always tell you why.' },
  { tag: 'c7m1', q: 'ImagePullBackOff means:', opts: ['unstable image tag / registry unavailable / permissions', 'not enough CPU', 'a missing secret'], ans: 0, pts: 10, why: 'The pull fails: fix the tag or the registry permissions.' },
  { tag: 'c6m1', q: 'Readiness probe vs Liveness:', opts: ['Readiness = out of traffic · Liveness = restart', 'Both restart it', 'Only Readiness restarts'], ans: 0, pts: 10, why: 'Readiness removes traffic, Liveness restarts.' }
];

/* =================================================================== */

const MISSIONS_B = [

  /* ============================ 5.1 ============================ */
  {
    id: 'c5m1', ch: 5, dur: 15, badge: 'scaler',
    title: 'Scale up for the payroll run',
    glossary: ['HPA'],
    steps: [
      { type: 'talk', lines: [
        { w: 'alert', t: '🟠 SERVICE DESK: "The payroll run is stuck, the FIORI screens keep spinning. Minor P1."' },
        { w: 'kubea', t: "This is the old \"quick, add an AAS before 5 pm\". The Kubernetes version: one command, 10 seconds, no VM to provision." },
        { w: 'kubea', t: "Even better: the autoscaler. You set a rule (HPA): \"between 2 and 6 replicas, CPU target 60%\". The cluster does the math on its own." }
      ]},
      { type: 'terminal', title: 'Manual push, then it is automatic', world: 'scaleLab',
        brief: ['A load peak is announced in the middle of the session. Watch what happens:'],
        tasks: [
          { t: 'Where does tlx-aas stand? (2 replicas for now)', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?', pts: 10, hint: 'kubectl get pods' },
          { t: '<b>Scale</b> tlx-aas to 6 replicas', cmd: 'kubectl scale deployment tlx-aas --replicas=6', match: '^kubectl\\s+scale\\s+deployments?\\/?\\s*tlx-aas\\s+--replicas=6$', pts: 10, hint: 'kubectl scale deployment tlx-aas --replicas=6' },
          { t: 'List the pods: we are in extension mode!', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?', pts: 10, hint: 'kubectl get pods' }
        ],
        tasks2: [
          { t: 'Is a <b>HPA</b> already in place? (hint: not yet)', cmd: 'kubectl get hpa', match: '^kubectl\\s+get\\s+hpa$', pts: 10, hint: 'kubectl get hpa' },
          { t: 'Set the rule: <b>hpa.yml</b> (min 2 · max 6 · CPU target 60%)', cmd: 'kubectl apply -f hpa.yml', match: '^kubectl\\s+apply\\s+-f\\s+hpa\\.yml$', pts: 10, hint: 'kubectl apply -f hpa.yml' },
          { t: 'Look at the <b>HPA</b>: current load vs target', cmd: 'kubectl get hpa', match: '^kubectl\\s+get\\s+hpa$', pts: 10, hint: 'kubectl get hpa' },
          { t: 'Wait 2-3 s then check again: who adjusted the replica count?', cmd: 'kubectl get hpa', match: '^kubectl\\s+get\\s+hpa$', pts: 10, hint: 'kubectl get hpa' }
        ]},
      { type: 'quiz', qs: [
        { q: 'What the HPA\'s 60% target actually measures is…', pts: 10,
          opts: ['the average usage of the pods via the Metrics Server (the built-in ST06)', 'the users\' mood', 'disk space'], ans: 0,
          why: "Per-pod CPU/RAM metrics (kubectl top). The ST06 equivalent is back on duty via Prometheus/metrics-server." },
        { q: 'When the peak is over, what does the autoscaler do?', pts: 10,
          opts: ['Nothing: the replicas stay up', 'Scales back down to the minimum (2) — automatic savings', 'Deletes the Service'], ans: 1,
          why: "It is the same reflex as shutting instances down at night: automatic savings, and your hands stay free." }
      ]},
      { type: 'text', blocks: [
        { h: 'Vocabulary', list: [ 'scale = change the replica count live; HPA = automatic adjustment driven by a metric.' ] }
      ]}
    ]
  },

  /* ============================ 5.2 ============================ */
  {
    id: 'c5m2', ch: 5, dur: 18,
    title: 'Memory: requests & limits (exit 137)',
    glossary: ['Requests/Limits', 'OOMKilled'],
    steps: [
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 P1: during the payroll run, an app server just stopped dead. That is already the 3rd ticket.' },
        { w: 'kubea', t: "Your world knew memory extension (EM/heap) and instance parameters. Kubernetes is more brutal: two numbers, period." },
        { w: 'narr', t: "request = the guaranteed reservation at startup (the scheduler places the Pod where there is room). limit = the hard ceiling; crossed → the kernel sends SIGKILL: exit 137, OOMKilled. No swap. No mercy." },
        { w: 'kubea', t: "Diagnose first, then correct course — like the good old days of instance profiles, but in YAML." }
      ]},
      { type: 'terminal', title: 'Who killed my app server?', world: 'resLab',
        brief: ['A tlx-aas pod died during a peak. Find the cause, fix the sizing.'],
        tasks: [
          { t: 'List the pods: who is down for the count?', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Technical sheet of the corpse: why did it die?', cmd: 'kubectl describe pod <name>', match: '^kubectl\\s+describe\\s+pod\\s+tlx-aas', pts: 10, hint: 'kubectl describe pod <name-from-get-pods>' },
          { t: 'Logs of the victim: the moment of the crash', cmd: 'kubectl logs <name>', match: '^kubectl\\s+logs\\s+tlx-aas', pts: 10, hint: 'kubectl logs <name>' },
          { t: 'The fix: apply <b>aas-res-fix.yml</b> (requests/limits raised)', cmd: 'kubectl apply -f aas-res-fix.yml', match: '^kubectl\\s+apply\\s+-f\\s+aas-res-fix\\.yml$', pts: 10, hint: 'kubectl apply -f aas-res-fix.yml' },
          { t: 'Check: a new pod was born with the new template', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' }
        ]},
      { type: 'quiz', qs: [
        { q: 'What is a Pod\'s "request" for?', pts: 10,
          opts: ['for the scheduler: reserve room before placement (like a RAM/CPU ticket)', 'for the DNS', 'for backups'], ans: 0,
          why: 'The scheduler only places a Pod on a Node where the requests fit: your up-front sizing, in declarative form.' },
        { q: 'And what happens if a pod gets thirsty for more than its "limit"?', pts: 10,
          opts: ['The Node crashes', 'OOMKilled: SIGKILL, exit 137', 'The pod grows', 'Swap takes over'], ans: 1,
          why: 'No swap in Kubernetes: crossing the limit means a violent death. Size it like your EM profiles, but without the OS flexibility.' }
      ]},
      { type: 'text', blocks: [
        { h: 'New reflex', list: [
          'HANA / ASCS: Guaranteed (request = limit).',
          'AAS: Burstable (limit > request) to absorb peaks.',
          'No swap: size it like your EM profiles, but without the host system flexibility.'
        ]}
      ]}
    ]
  },

  /* ============================ 6.1 ============================ */
  {
    id: 'c6m1', ch: 6, dur: 20,
    title: 'Rolling update: without a maintenance window',
    glossary: ['Rolling update', 'Readiness/Liveness'],
    steps: [
      { type: 'talk', lines: [
        { w: 'dsi', t: "Arnaud, the kernel SP stack arrives tonight. Should we open a maintenance window?" },
        { w: 'kubea', t: "A question from another century, of course. The new world: the Deployment replaces the pods one by one (rolling update), guarded by the readiness probes, with zero user downtime. The maintenance window goes to the heritage museum." },
        { w: 'kubea', t: "And if everything collapses? kubectl rollout undo, 10 seconds. No more all-night restoration marathons." }
      ]},
      { type: 'terminal', title: 'SP 7.50-sp23 in rolling mode', world: 'rolloutLab',
        brief: ["The AAS image changes: each new instance starts up, waits until it is READY, and only then does the old one step aside."],
        tasks: [
          { t: 'Before: where are we? (3 pods on sp22, up for 5 days)', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Issue the <b>set image</b> command to nwas:7.50-sp23', cmd: 'kubectl set image deployment/tlx-aas nwas=...', match: '^kubectl\\s+set\\s+image\\s+deployments?/tlx-aas\\s+\\S+=reg\\.airbus\\.io/nwas:7\\.50-sp23$', pts: 10, hint: 'kubectl set image deployment/tlx-aas nwas=reg.airbus.io/nwas:7.50-sp23' },
          { t: 'Follow the <b>rollout status</b> (repeat if it keeps you waiting)', cmd: 'kubectl rollout status deployment/tlx-aas', match: '^kubectl\\s+rollout\\s+status\\s+deployments?/tlx-aas$', pts: 10, hint: 'kubectl rollout status deployment/tlx-aas' },
          { t: 'Watch: brand-new pod names, the old ones removed as we go', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: '⚠ The packager made a mistake: switch to the non-existent image <b>7.50-sp99</b>', cmd: 'kubectl set image deployment/tlx-aas nwas=reg.airbus.io/nwas:7.50-sp99', match: '^kubectl\\s+set\\s+image\\s+deployments?/tlx-aas\\s+\\S+=reg\\.airbus\\.io/nwas:7\\.50-sp99$', pts: 10, hint: 'kubectl set image deployment/tlx-aas nwas=reg.airbus.io/nwas:7.50-sp99' },
          { t: 'Check the <b>rollout status</b>: it is going to stall', cmd: 'kubectl rollout status deployment/tlx-aas', match: '^kubectl\\s+rollout\\s+status\\s+deployments?/tlx-aas$', pts: 10, hint: 'kubectl rollout status deployment/tlx-aas' },
          { t: 'Roll back: <b>rollout undo</b>', cmd: 'kubectl rollout undo deployment/tlx-aas', match: '^kubectl\\s+rollout\\s+undo\\s+deployments?/tlx-aas$', pts: 10, hint: 'kubectl rollout undo deployment/tlx-aas' },
          { t: 'Wrap up: rollout status one more time', cmd: 'kubectl rollout status deployment/tlx-aas', match: '^kubectl\\s+rollout\\s+status\\s+deployments?/tlx-aas$', pts: 10, hint: 'kubectl rollout status deployment/tlx-aas' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Why does a pod REPLACE the old one before that one dies?', pts: 10,
          opts: ['because of maxUnavailable/maxSurge', 'to save CPU', 'for the backup'], ans: 0,
          why: "maxSurge creates an extra pod before removing one: the Service always keeps the right number of backends." },
        { q: 'We applied a dubious image tag (sp99). Image not found… the rollout:', pts: 10,
          opts: ['plows on regardless', 'is BLOCKED: the new pods stay in ImagePullBackOff', 'reverts instantly'], ans: 1,
          why: "The checks (readiness + image pull) stop the error from spreading: you review, you cancel with rollout undo — no night of restoration." }
      ]},
      { type: 'text', blocks: [
        { h: 'The switchover has a guardian', p: "A new pod only receives traffic once its readiness probe answers \"ready\". Users see nothing: no more \"maintenance, Saturday 10pm-4am\"." }
      ]}
    ]
  },

  /* ============================ 7.1 ============================ */
  {
    id: 'c7m1', ch: 7, dur: 30, badge: 'debug',
    title: 'ST22 has retired: 5 incidents under real conditions',
    glossary: ['CrashLoopBackOff', 'ImagePullBackOff', 'Pending'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "Your ST22, SM21 and ST06 have gone away for the weekend. The new first-responder kit: kubectl get / describe / logs. 5 consecutive TLX incidents, from the most common to the nastiest. Every time: gather the symptoms, form a hypothesis, make the call." }
      ]},

      /* Incident 1: image tag gone wrong */
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 INCIDENT 1/5 — The tlx-dia pods are degrading: the servers no longer come up.' },
        { w: 'kubea', t: "kubectl get pods, describe, logs. The answer is in the events." }
      ]},
      { type: 'terminal', title: 'Incident 1 — tlx-dia no longer boots', world: 'dbg1',
        brief: [],
        tasks: [
          { t: 'List the <b>pods</b>', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Describe a sick pod (state & events)', cmd: 'kubectl describe pod tlx-dia-…', match: '^kubectl\\s+describe\\s+pod\\s+tlx-dia', pts: 10, hint: 'kubectl describe pod <name>' },
          { t: 'The fix (correct the tag): set image 7.50-sp22', cmd: 'kubectl set image deployment/tlx-dia nwas=reg.airbus.io/nwas:7.50-sp22', match: '^kubectl\\s+set\\s+image\\s+deployments?/tlx-dia\\s+\\S+=reg\\.airbus\\.io/nwas:7\\.50-sp22$', pts: 10, hint: 'kubectl set image deployment/tlx-dia nwas=reg.airbus.io/nwas:7.50-sp22' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Root cause of incident 1:', pts: 10,
          opts: ['The image tag 7.51 does not exist in the registry', 'The node is dying', 'A secret is missing', 'A PV is broken'], ans: 0,
          why: 'ErrImagePull: a non-existent tag. The most common class of Azure/K8s deployment incidents — always describe first.' }
      ]},

      /* Incident 2: missing secret */
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 INCIDENT 2/5 — The tlx-btc batch workers crash in a loop: CrashLoopBackOff' },
        { w: 'kubea', t: "Look at the logs this time — and at the describe too (Failed…). " }
      ]},
      { type: 'terminal', title: 'Incident 2 — CrashLoopBackOff in series', world: 'dbg2',
        brief: [],
        tasks: [
          { t: 'The record of the looping pod (env & events)', cmd: 'kubectl describe pod tlx-btc-…', match: '^kubectl\\s+describe\\s+pod\\s+tlx-btc', pts: 10, hint: 'kubectl describe pod <name>' },
          { t: 'Logs of the crash', cmd: 'kubectl logs tlx-btc-…', match: '^kubectl\\s+logs\\s+tlx-btc', pts: 10, hint: 'kubectl logs <name>' },
          { t: 'Where is the missing piece coming from? Check the secrets', cmd: 'kubectl get secrets', match: '^kubectl\\s+get\\s+secrets?$', pts: 10, hint: 'kubectl get secrets' },
          { t: 'Create the missing secret via <b>creds-secret.yml</b>', cmd: 'kubectl apply -f creds-secret.yml', match: '^kubectl\\s+apply\\s+-f\\s+creds-secret\\.yml$', pts: 10, hint: 'kubectl apply -f creds-secret.yml' },
          { t: 'Then recreate a pod so it loads the secret at boot', cmd: 'kubectl delete pod tlx-btc-…', match: '^kubectl\\s+delete\\s+pod\\s+tlx-btc', pts: 10, hint: 'kubectl delete pod <name>' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Root cause of incident 2:', pts: 10,
          opts: ['The Secret tlx-dbcreds did not exist in the namespace', 'A broken image', 'Not enough CPU', 'A detached PV'], ans: 0,
          why: 'CreateContainerConfigError: the Deployment referenced a missing secret. Env injection is critical too.' }
      ]},

      /* Incident 3: capacity */
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 INCIDENT 3/5 — You scale tlx-dia up to 8 replicas: 5 pods stay stuck in Pending.' },
        { w: 'kubea', t: "Where does that come from? Look at describe… and be a true Basis 2.0: capacity is part of your job." }
      ]},
      { type: 'terminal', title: 'Incident 3 — is the trouble capacity?', world: 'dbg3',
        brief: ['Tip: there are 2 legitimate answers — raise the capacity (add a node) OR reduce the demand. Here, we apply the <b>node-add.yml</b>.'],
        tasks: [
          { t: 'The record of a <b>pod in Pending</b> (mandatory reading)', cmd: 'kubectl describe pod tlx-dia-…', match: '^kubectl\\s+describe\\s+pod\\s+tlx-dia', pts: 10, hint: 'kubectl describe pod <name>' },
          { t: "The record of a <b>node</b>: the CPU allocation is saturated", cmd: 'kubectl describe node k8s-worker-01', match: '^kubectl\\s+describe\\s+node\\s+k8s-worker-0', pts: 10, hint: 'kubectl describe node k8s-worker-01' },
          { t: 'Give it some breathing room: apply <b>node-add.yml</b> (new worker)', cmd: 'kubectl apply -f node-add.yml', match: '^kubectl\\s+apply\\s+-f\\s+node-add\\.yml$', pts: 10, hint: 'kubectl apply -f node-add.yml' },
          { t: 'List the pods: who was just hosted by the newcomer?', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Cause of incident 3:', pts: 10,
          opts: ['Not enough CPU on the existing nodes (capacity planning)', 'Missing secret', 'Wrong tag'], ans: 0,
          why: 'Insufficient cpu: your historical trade comes back with a vengeance — capacity is sized via requests, not via VM souls.' }
      ]},

      /* Incident 4: probes kill */
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 INCIDENT 4/5 — The tlx-dia pods restart ALL THE TIME while the application works… very slowly.' },
        { w: 'kubea', t: "A healthy instance that keeps restarting? Look at the probes: liveness, readiness and their delays." }
      ]},
      { type: 'terminal', title: 'Incident 4 — a liveness probe that is too trigger-happy', world: 'dbg4',
        brief: [],
        tasks: [
          { t: 'List the pods: count the <b>RESTARTS</b>', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Describe: who restarts whom? (probe)', cmd: 'kubectl describe pod tlx-dia-…', match: '^kubectl\\s+describe\\s+pod\\s+tlx-dia', pts: 10, hint: 'kubectl describe pod <name>' },
          { t: 'Apply the fix <b>probe-fix.yml</b> (liveness delay 5s → 90s)', cmd: 'kubectl apply -f probe-fix.yml', match: '^kubectl\\s+apply\\s+-f\\s+probe-fix\\.yml$', pts: 10, hint: 'kubectl apply -f probe-fix.yml' }
        ]},
      { type: 'quiz', qs: [
        { q: 'A vital distinction:', pts: 10,
          opts: ['Liveness: restarts the sick container · Readiness: removes it from traffic', 'Both do the same thing', 'Readiness restarts'], ans: 0,
          why: 'Liveness manages life; readiness manages traffic. Tuning the delays (initialDelay) properly avoids killing instances that start too slowly.' }
      ]},

      /* Incident 5: svc selector */
      { type: 'talk', lines: [
        { w: 'alert', t: '🔴 INCIDENT 5/5 — The tlx-fiori app is running perfectly… but nobody can reach it.' },
        { w: 'kubea', t: "Dear colleague: the Service cannot find its pods. Why?" }
      ]},
      { type: 'terminal', title: 'Incident 5 — the mystery of the endpoints', world: 'dbg5',
        brief: [],
        tasks: [
          { t: 'Where are the pods (they are running…)', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'The record of the <b>service tlx-web</b>: what about the endpoints?', cmd: 'kubectl describe svc tlx-web', match: '^kubectl\\s+describe\\s+svc\\s+tlx-web$', pts: 10, hint: 'kubectl describe svc tlx-web' },
          { t: 'Compare the <b>labels</b>… then apply <b>svc-fix.yml</b>', cmd: 'kubectl apply -f svc-fix.yml', match: '^kubectl\\s+apply\\s+-f\\s+svc-fix\\.yml$', pts: 10, hint: 'kubectl apply -f svc-fix.yml' },
          { t: 'Verify again: the endpoints are there!', cmd: 'kubectl describe svc tlx-web', match: '^kubectl\\s+describe\\s+svc\\s+tlx-web$', pts: 10, hint: 'kubectl describe svc tlx-web' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Cause of incident 5:', pts: 10,
          opts: ['The Service selector (app=…) does not match the pod labels (run=…)', 'The DNS vanished', 'A pod OOMKilled'], ans: 0,
          why: 'A Service routes by labels. One letter off: 0 endpoints, in total silence.' }
      ]},
      { type: 'text', blocks: [
        { h: 'Your new first-responder kit', list: [
          'get pods → the patient · describe → the clues and events · logs → the cause, narrated.',
          'Pending = capacity · ImagePull = registry/tag · CrashLoop = config/secret · OOM = limits.',
          'Structured messages (Events + exit codes): never again will you decode dumps.'
        ]}
      ]}
    ]
  },

  /* ============================ 8.1 ============================ */
  {
    id: 'c8m1', ch: 8, dur: 25, badge: 'archi',
    title: 'Assemble the TLX quality system',
    glossary: ['Deployment', 'StatefulSet'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "Every building block has been covered. Pause and savor this: you are going to write the architecture of the complete TLX system, component by component. Choose the right tool for each block." }
      ]},
      { type: 'build', slots: [
        { label: 'HANA (the database of the quality system)', sub: 'Primary + secondaries, redo logs, one volume each',
          opts: [
            { t: 'Deployment', y: 'kind: Deployment\n→ interchangeable pods, shared volumes…' },
            { t: 'StatefulSet + PVC per pod', y: 'kind: StatefulSet\nvolumeClaimTemplates:\n- name: data\n  sizes: 200Gi' },
            { t: 'CronJob', y: 'kind: CronJob' }
          ], ans: 1, why: "Stable identity + a dedicated PVC per replica + startup order: the HANA way." },
        { label: 'The 3 AAS (stateless app servers)', sub: 'Interchangeable, scalable, zero-downtime rollouts',
          opts: [
            { t: 'Deployment (replicas: 3)', y: 'kind: Deployment\nreplicas: 3\nstrategy: RollingUpdate' },
            { t: 'StatefulSet', y: 'stable identity… useless here' },
            { t: 'DaemonSet', y: 'one pod per node: perfect for monitoring, overkill for the AAS' }
          ], ans: 0, why: 'AAS = scalable, self-healing livestock → Deployment.' },
        { label: 'ASCS (enqueue/message server)', sub: 'A single instance, with untouchable identity and disk',
          opts: [
            { t: 'Deployment', y: 'changing name, shared volume — no' },
            { t: 'StatefulSet (replicas: 1)', y: 'stable name tlx-ascs-0 + dedicated PVC' },
            { t: 'Job', y: 'a bounded task…' }
          ], ans: 1, why: "ASCS: identity + persistence → a StatefulSet with 1 replica. (ERS will handle the mirror.)" },
        { label: 'DEFAULT.PFL & instance profiles', sub: 'Non-sensitive parameters, identical for all the AAS',
          opts: [
            { t: 'Secret', y: 'masked… overkill' },
            { t: 'ConfigMap mounted as files', y: 'env-from: configMapRef, /usr/sap/profile mounted' },
            { t: 'Image', y: 'rebuild an image for every parameter…' }
          ], ans: 1, why: 'ConfigMap mounted as files: the profiles change without rebuilding the image.' },
        { label: 'DB credentials / SSFS', sub: 'Sensitive data never in plain text',
          opts: [
            { t: 'ConfigMap', y: 'NOT that — readable plain text' },
            { t: 'Secret', y: 'secretRef, mounted opaque' },
            { t: 'PVC', y: 'a disk for passwords?' }
          ], ans: 1, why: 'A Secret, of course.' },
        { label: 'Exposing the Fiori Launchpad', sub: 'HTTPS, routing by host, certificates',
          opts: [
            { t: 'Service ClusterIP only', y: 'internal…' },
            { t: 'Ingress + Service', y: 'tls:\n secretName: tls-cert\n rules: host fiori.airbus.com' },
            { t: 'NodePort', y: 'dev/test only' }
          ], ans: 1, why: 'Ingress: TLS, host, rules. The Web Dispatcher has truly found its worthy successor.' }
      ]},
      { type: 'terminal', title: 'The great assembly', world: 'landLab',
    brief: ['The manifest assembled from your choices is ready. Press Enter:'],
        tasks: [
          { t: 'Deploy the manifest <b>tlx-landscape.yml</b>', cmd: 'kubectl apply -f tlx-landscape.yml', match: '^kubectl\\s+apply\\s+-f\\s+tlx-landscape\\.yml$', pts: 15, hint: 'kubectl apply -f tlx-landscape.yml' },
          { t: 'See the complete TLX landscape', cmd: 'kubectl get all -n tlx', match: '^kubectl\\s+get\\s+all(\\s+-n\\s+\\w+)?$', pts: 10, hint: 'kubectl get all -n tlx' },
          { t: 'List the pods for the final confirmation', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' }
        ]},
      { type: 'text', blocks: [
        { h: '🕊️ TLX is migrated', p: "The SAP quality system now runs on Kubernetes: HANA and ASCS as StatefulSets, the AAS as a Deployment, the profiles as a ConfigMap, the credentials as a Secret, the exposure as an Ingress. Your runbook has just gotten noticeably lighter." }
      ]}
    ]
  },

  /* ============================ 8.2 ============================ */
  {
    id: 'c8m2', ch: 8, dur: 25, badge: 'boss',
    title: 'Final boss: TXP production',
    dynamicQuiz: 'final',
    glossary: ['Jobs'],
    steps: [
      { type: 'talk', lines: [
        { w: 'dsi', t: "Arnaud, the quality system is holding up. But remember: TXP production goes live tomorrow night. Can I sleep with both eyes closed?" },
        { w: 'kubea', t: "Full review: a series of questions, then your first production incident — live. You will only have the tools you already master: kubectl, your brain, and the logbook." }
      ]},
      { type: 'quiz', dynamic: 'final' },
      { type: 'terminal', title: 'Production incident: the suspense', world: 'prodLab',
        brief: ["Live P1 alert. Diagnose, decide, act — then lock it down."],
        tasks: [
          { t: 'Diagnose: who is burning? (pod CPU + RAM)', cmd: 'kubectl top pods', match: '^kubectl\\s+top\\s+pods?$', pts: 15, hint: 'kubectl top pods' },
          { t: 'Read the <b>logs</b> of the culprit (the one running at 950m)', cmd: 'kubectl logs txp-btc-…', match: '^kubectl\\s+logs\\s+txp-btc', pts: 15, hint: 'kubectl logs <pod-950m>' },
          { t: "Release the pressure: scale down the <b>batch workers</b> saturating the primary (drop to 2)", cmd: 'kubectl scale deployment txp-btc --replicas=2', match: '^kubectl\\s+scale\\s+(?:deployment\\.apps\\/|deployments?[\\/ ]+)txp-btc\\s+--replicas=2$', pts: 15, hint: 'kubectl scale deployment txp-btc --replicas=2' },
          { t: 'Confirm: the incident is resolved', cmd: 'kubectl get events', match: '^kubectl\\s+get\\s+events?$', pts: 15, hint: 'kubectl get events' }
        ]},
      { type: 'talk', lines: [
        { w: 'kubea', t: "Diagnosis in 30 seconds, a sharp action, zero human mobilization. In production. You now have the reflexes of the modern operations engineer: measure, understand, act, verify." },
        { w: 'dsi', t: "Impressive. And TXP, you can tame it too? Without a maintenance window?" },
        { w: 'kubea', t: "Arnaud, you get the closing line: the configuration is declared, the runtime executes. A new runbook begins — yours." }
      ]},
      { type: 'diploma' }
    ]
  }
];

/* ---------- Final merge ---------- */
const MISSIONS = [...MISSIONS_A, ...MISSIONS_B];
if (typeof module !== 'undefined') { module.exports = { MISSIONS, EQMAP, GLOSS, BADGES, TRACKS, QUIZ_BANK }; }