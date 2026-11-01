'use strict';
/* =====================================================================
   data-a.js — Teaching content (chapters 1 to 4) + equivalence sheet
   All worlds are defined in world.js.
   ===================================================================== */

/* ---------- The great SAP ↔ Kubernetes equivalence table ---------- */
const EQMAP = [
  ['Physical server / host VM', 'Node', "The cluster moves the load from one Node to another"],
  ['Landscape / environment (SID: QAS, PRD…)', 'Namespace', 'An isolated space of resources and names'],
  ['Application instance (PAS/AAS)', 'Pod', 'Unique env with its own little life, replaceable'],
  ['Kernel binaries + runtime installed', 'Container image', 'Immutable, versioned, reproducible package'],
  ['Work process (DIA, BTC…)', 'Container (simplification)', 'One or more containers in the Pod'],
  ['DEFAULT.PFL / instance profiles', 'ConfigMap', 'Parameters injected as variables or files'],
  ['SSFS / Secure Store / DB password', 'Secret', 'Sensitive data, never in plain text in the code'],
  ['/usr/sap, /sapmnt, /hana/data', 'PersistentVolume + PVC', 'The disk lives outside the Pod and outlives it'],
  ['Add an AAS for the load', 'kubectl scale (replicas)', 'An adjustment measured in seconds'],
  ['SAP Web Dispatcher (HTTP)', 'Ingress', 'HTTP/HTTPS routing by host and path'],
  ['Message Server / logon-RFC distribution', 'Service', 'Stable IP + distribution across ready pods'],
  ['Virtual host / anticipation VIP', 'Service ClusterIP + DNS', 'Pods die, the address stays'],
  ['Watchdog / SmartAlerting / instance check', 'Liveness & Readiness probes', 'The cluster probes health and acts'],
  ['Kernel update in a maintenance window', 'Rolling update', 'N-1 → N without a global outage'],
  ['Pacemaker on cloneable instances', 'Self-healing (ReplicaSet)', 'Automatic drift correction'],
  ['SM21 (system logs)', 'kubectl logs <pod>', 'Unified stream, live'],
  ['ST22 / dumps', 'Events + CrashLoopBackOff', 'Errors are structured'],
  ['SM37 (batch)', 'Job / CronJob', 'Time-bounded tasks'],
  ['ST06 / OS07N', 'Metrics Server · kubectl top', 'Metrics in one command'],
  ['Homogeneous System Copy', 'PV backup / snapshot', 'Restore = put the volume back in place']
];

/* ---------- Chapters 1 & 2 ---------- */
const MISSIONS_A = [

  /* ============================ 1.1 ============================ */
  {
    id: 'c1m1', ch: 1, dur: 10,
    title: 'Welcome to the world of the cluster',
    glossary: ['Node', 'Control plane', 'Namespace', 'kubectl', 'Cluster'],
    steps: [
      { type: 'talk', lines: [
        { w: 'narr', t: 'Monday, 8:47 a.m., Airbus headquarters, Toulouse. You are Arnaud, an SAP Basis administrator for 8 years. This morning, an email is shaking the datacenter walls.' },
        { w: 'dsi', t: " Hello everyone. Airbus is migrating the entire SAP landscape to Kubernetes: QA (SID TLX) first, production (TXP) at the end of the year. Arnaud, QA is your baby. Build on it." },
        { w: 'alex', t: "Panic. Paaanic. Kubernetes… I have only ever seen that word on marketing slides. And my dear Pacemaker?" },
        { w: 'kubea', t: "Hello Arnaud. I am Kubea, your Kubernetes copilot. Good news: you already master ~70% of the reflexes. We are not going to learn an unknown universe: we are going to translate it." },
        { w: 'kubea', t: 'Answer the following questions to calibrate your compass.' }
      ]},
      { type: 'text', blocks: [
        { h: 'The 3 words to install right away', def: [
          { t: 'Node', d: 'A server (physical or VM) providing CPU, RAM and disk. Your former "AS ABAP installation host", but standardized and replaceable.' },
          { t: 'Cluster', d: 'The whole set of Nodes + a brain. The operating unit, no longer the server.' },
          { t: 'Control plane', d: 'The conductor: it places the workloads, watches health, recreates what dies. You declare "the desired state", it does the rest.' }
        ]},
        { tip: 'At SAP, you cared for each server like a pet. Kubernetes treats them like cattle: disposable, replaceable, rebuilt identically.' },
        { warn: 'The control plane lives on its own "control-plane" Nodes. You NEVER SSH into it — just like you do not tinker with the kernel of a HANA appliance.' }
      ]},
      { type: 'quiz', qs: [
        { q: 'In Kubernetes, the closest equivalent of a "physical server" is:', pts: 10,
          opts: ['A Pod', 'A Node', 'A Namespace', 'The control plane'], ans: 1,
          why: "A Node provides the resources. It does not host SAP directly: it admits Pods that the control plane places — and can place somewhere else." },
        { q: 'The control plane is…', pts: 10,
          opts: ['The equivalent of the ASCS central server', 'A super-index of HANA', 'The conductor that places the load and resurrects what dies', 'A cloud firewall'], ans: 2,
          why: 'Exactly. Without restarting or failing over manually: the orchestrator decides, you declare.' },
        { q: 'Namespaces are mainly used to…', pts: 10,
          opts: ['Isolate and partition resources (one environment / one SID for example)', 'Encrypt the network', 'Add more CPUs', 'Update the images'], ans: 0,
          why: 'A namespace = a compartmentalization of names and rights. Airbus has already created the "tlx" namespace for your SID.' }
      ]},
      { type: 'terminal', title: 'First contact with kubectl', world: 'empty',
        brief: ['kubectl is the SAPMMC of Kubernetes: a single tool to list, describe and declare all resources.',
          'Type the command requested by each task. "help" lists what you can do.'],
        tasks: [
          { t: 'List the <b>nodes</b> of the cluster ( Nodes )', cmd: 'kubectl get nodes', match: '^kubectl\\s+get\\s+nodes?$', pts: 10, hint: 'kubectl get nodes' },
          { t: 'List the <b>namespaces</b>: our SID TLX is already there', cmd: 'kubectl get namespaces', match: '^kubectl\\s+get\\s+names?p?a?c?e?s?$', pts: 10, hint: 'kubectl get namespaces' },
          { t: 'See what <b>tlx</b> already contains: go check out the pods in the tlx namespace', cmd: 'kubectl get pods -n tlx', match: '^kubectl\\s+get\\s+pods?(\\s+-n\\s+tlx)?$', pts: 10, hint: 'kubectl get pods -n tlx' }
        ]},
      { type: 'talk', lines: [
        { w: 'kubea', t: 'Notice: the tlx namespace contains exactly zero pods. The SAP landscape is about to start under your fingers. To be continued.' }
      ]},
      { type: 'text', blocks: [
        { h: 'What you have learned', list: [
          'Node (server) · Cluster · Control plane (conductor) · Namespace (fence) · kubectl (the single console).',
          'No more servers "to nurse": you declare, the orchestrator executes and repairs.'
        ]}
      ]}
    ]
  },

  /* ============================ 1.2 ============================ */
  {
    id: 'c1m2', ch: 1, dur: 15, badge: 'pod',
    title: 'The Pod: your first SAP instance',
    glossary: ['Pod', 'Image', 'Container'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "Today, you do not create a \"server\", nor even a \"system\". The smallest deployable unit is the Pod." },
        { w: 'kubea', t: 'A Pod = an SAP instance (PAS, AAS…) in cloud version: an envelope with 1 to 2 containers, an IP, a life cycle managed by the cluster.' },
        { w: 'narr', t: 'Like an AAS, a Pod is disposable. What matters: its content (the image) and its external data (the volumes — in chapter 4).' }
      ]},
      { type: 'text', blocks: [
        { h: 'Image = ready-to-use binaries', p: "The container image is your complete SAP installation package — kernel, services, libraries — frozen, versioned and reproducible. An image never contains customer data: that stays on volumes." },
        { table: { h: ['SAP universe', 'Kubernetes universe'], r: [
          ['Server/VM', 'Node'],
          ['PAS/AAS instance', 'Pod'],
          ['Binaries + runtime installed', 'Container image'],
          ['Data & parameters', 'Volumes & ConfigMaps (later)']
        ]}},
        { warn: 'A Pod can die at any moment: node failure, maintenance, lack of resources. That is normal, even desirable: it will be recreated.' }
      ]},
      { type: 'terminal', title: 'Launching the PAS by hand', world: 'firstPod',
        brief: ['Special: no YAML manifest. The kubectl run command creates a single "bare" Pod — perfect for understanding the base object.',
          'One single command, hands in the grease.'],
        tasks: [
          { t: 'Create the Pod <b>tlx-pas</b>: image reg.airbus.io/nwas:7.50-sp22', cmd: 'kubectl run tlx-pas --image=...', match: '^kubectl\\s+run\\s+tlx-pas\\s+--?image\\S*=?reg\\.airbus\\.io/nwas.*', pts: 10, hint: 'kubectl run tlx-pas --image=reg.airbus.io/nwas:7.50-sp22' },
          { t: 'List the pods: note the STATUS', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Look at the <b>system logs</b> of the Pod (the old SM21)', cmd: 'kubectl logs tlx-pas', match: '^kubectl\\s+logs\\s+tlx-pas$', pts: 10, hint: 'kubectl logs tlx-pas' },
          { t: 'Open the <b>technical sheet</b> of the pod (equiv. ST06 + profiles)', cmd: 'kubectl describe pod tlx-pas', match: '^kubectl\\s+describe\\s+pod\\s+tlx-pas$', pts: 10, hint: 'kubectl describe pod tlx-pas' }
        ]},
      { type: 'quiz', qs: [
        { q: 'The container image corresponds, in the SAP universe, to:', pts: 10,
          opts: ['A client dump with production data', 'Ready-to-use binaries/kernel, without data', 'The DEFAULT.PFL profile', 'A complete virtual machine'], ans: 1,
          why: "Image = immutable artifact containing the code. Data (volumes) and config (ConfigMaps) graft themselves onto it at runtime." },
        { q: 'The Node hosting tlx-pas suddenly fails. What happens?', pts: 10,
          opts: ['The instance restarts in place', 'The Pod dies with the Node', 'The Pod data is redistributed', 'The DNS changes'], ans: 1,
          why: 'The Pod is bound to its Node. It dies with it… but a mechanism we discover in chapter 3 will bring it back to life automatically somewhere else.' }
      ]},
      { type: 'talk', lines: [
        { w: 'kubea', t: 'A pod all alone is a dancer without choreography: if you kill it, nobody will bring it back on stage. That is exactly the topic of the next chapter.' }
      ]}
    ]
  },

  /* ============================ 2.1 ============================ */
  {
    id: 'c2m1', ch: 2, dur: 20,
    title: 'Translating the SAP landscape',
    glossary: ['Service', 'Ingress', 'Replica (scale)'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: 'Before assembling anything, let us take inventory. Here is the official correspondence table of Airbus. To understand, not to learn by heart: it is in your Logbook (📘, at the top).' }
      ]},
      { type: 'text', blocks: [
        { h: 'SAP ↔ Kubernetes equivalence table', eqtable: true }
      ]},
      { type: 'mapping', items: [
        { sap: 'DEFAULT.PFL / instance profile', opts: ['ConfigMap', 'Secret', 'Ingress'], ans: 0, why: "Profiles are readable and not sensitive → ConfigMap. (Passwords, on the other hand, go into Secrets.)" },
        { sap: 'Database password (SSFS / Secure Store)', opts: ['Namespace', 'Secret', 'Deployment'], ans: 1, why: 'Anything sensitive goes into a Secret, never in plain text nor in the image.' },
        { sap: '/usr/sap/SID + /sapmnt + /hana/data', opts: ['Service', 'PersistentVolume', 'Job'], ans: 1, why: 'The disk is decoupled from the Pod: it is provisioned and wired on demand (chapter 4).' },
        { sap: 'Publish the Fiori Launchpad on the web', opts: ['Ingress', 'ConfigMap', 'NodePort'], ans: 0, why: 'Ingress = HTTP/HTTPS routing by host and path — the modern Web Dispatcher.' },
        { sap: 'Add a 4th AAS to absorb the load', opts: ['kubectl scale (replicas)', 'Create a Secret', 'Add a PVC'], ans: 0, why: '"kubectl scale deployment tlx-aas --replicas=4": seconds, not days.' },
        { sap: 'The watchdog that restarts the dead instance', opts: ['Liveness probe + ReplicaSet', 'The DNS', 'A ConfigMap'], ans: 0, why: 'The probe declares health; the ReplicaSet recreates what is declared dead.' }
      ]},
      { type: 'terminal', title: "The inventory of the tlx namespace", world: 'tlxMini',
        brief: ['Kubernetes already has an equivalent of SM50? No: better. "kubectl get all" lists the essentials of what is running in the namespace.'],
        tasks: [
          { t: 'Get a global view of the tlx namespace', cmd: 'kubectl get all -n tlx', match: '^kubectl\\s+get\\s+all(\\s+-n\\s+\\w+)?$', pts: 10, hint: 'kubectl get all -n tlx' },
          { t: 'Inspect the <b>tlx-sapms service</b>: who is plugged in behind it?', cmd: 'kubectl describe svc tlx-sapms', match: '^kubectl\\s+describe\\s+svc\\s+tlx-sapms$', pts: 10, hint: 'kubectl describe svc tlx-sapms' }
        ]},
      { type: 'quiz', qs: [
        { q: 'To expose the FIORI Launchpad to the outside, the right resource is:', pts: 10,
          opts: ['ClusterIP', 'Ingress', 'PV', 'ConfigMap'], ans: 1,
          why: 'Ingress: HTTP routing rules (host/path) + TLS, facing the outside world.' },
        { q: 'The Message Server distributed logons across instances. Equivalent mechanism in K8s:', pts: 10,
          opts: ['The Service (distributes across ready pods)', 'The ConfigMap', 'The ReplicaSet', 'The PVC'], ans: 0,
          why: 'The Service distributes across "ready" pods (readiness). Same philosophy: you never point the client at a specific server.' },
        { q: 'Your consultants complain: "SM21 only tells about one server". In K8s, system logs are read with:', pts: 10,
          opts: ['kubectl logs <pod>', 'kubectl get svc', 'kubectl ns'], ans: 0,
          why: 'kubectl logs is the new SM21: one stream per pod, filterable and aggregable centrally (ELK…).' }
      ]},
      { type: 'talk', lines: [
        { w: 'kubea', t: 'You now have a common vocabulary: Pod, image, Node, namespace, Service, ConfigMap. On to the objects that make the magic work.' }
      ]}
    ]
  },

  /* ============================ 2.2 ============================ */
  {
    id: 'c2m2', ch: 2, dur: 20,
    title: 'Profiles & secrets: ConfigMap and Secret',
    glossary: ['ConfigMap', 'Secret'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "In your world, you edited default.pfl & restarted the instance. Here: same fight, other words. Parameters become ConfigMaps, secrets become Secrets." },
        { w: 'kubea', t: "These objects are injected into the Pod either as environment variables or as mounted files. The Pod reads all of this at startup." }
      ]},
      { type: 'terminal', title: 'The tlx profile in your hands', world: 'profileLab',
        brief: ['The PAS tlx-pas runs with the ConfigMap tlx-profile (SAP parameters) and the Secret tlx-dbcreds.',
          'Mini-lab: change the profile, observe, break it, repair it.'],
        tasks: [
          { t: 'Probe the <b>ConfigMap tlx-profile</b>: its parameters', cmd: 'kubectl describe configmap tlx-profile', match: '^kubectl\\s+describe\\s+(configmap|cm)\\s+tlx-profile$', pts: 10, hint: 'kubectl describe configmap tlx-profile' },
          { t: 'List the <b>ConfigMaps and Secrets</b> present (two resources, one single command)', cmd: 'kubectl get cm,secret', match: '^kubectl\\s+get\\s+(configmaps?|cm)\\s*,\\s*secrets?$', pts: 10, hint: 'kubectl get cm,secret' },
          { t: 'Apply the new profile: <b>profile-ok.yml</b> (ideal profile: 12 DIA)', cmd: 'kubectl apply -f profile-ok.yml', match: '^kubectl\\s+apply\\s+-f\\s+profile-ok\\.yml$', pts: 10, hint: 'kubectl apply -f profile-ok.yml' },
          { t: '⚠ The colleague made a blunder: apply <b>profile-cassé.yml</b> (0 DIA!)', cmd: 'kubectl apply -f profile-cassé.yml', match: '^kubectl\\s+apply\\s+-f\\s+profile-cassé\\.yml$', pts: 10, hint: 'kubectl apply -f profile-cassé.yml' },
          { t: 'Restart the PAS (<b>delete</b> the tlx-pas-… pod: the exact name is in get pods)', cmd: 'kubectl delete pod tlx-pas-…', match: '^kubectl\\s+delete\\s+pod\\s+tlx-pas', pts: 10, hint: "kubectl delete pod <name-from-get-pods>" },
          { t: "Watch the new pod: it reads the config at startup… and cracks", cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: '<b>logs</b> of the pod in CrashLoopBackOff: what is the deadly word?', cmd: 'kubectl logs ...', match: '^kubectl\\s+logs\\s+tlx-pas', pts: 10, hint: 'kubectl logs <pod>' },
          { t: 'Repair: re-apply <b>profile-ok.yml</b> then re-create the pod (delete) so it re-reads the config', cmd: 'kubectl apply -f profile-ok.yml', match: '^kubectl\\s+apply\\s+-f\\s+profile-ok\\.yml.*$|^kubectl\\s+delete\\s+pods?\\s+tlx-pas[\\w\\-.…]*$', pts: 10, hint: 'kubectl apply -f profile-ok.yml' }
        ]},
      { type: 'quiz', qs: [
        { q: 'After a "kubectl apply" on an existing ConfigMap, the running pods…', pts: 10,
          opts: ["automatically reload the config", "see NOTHING change — they must be re-created (or a rollout triggered)", "restart instantly", "crash"], ans: 1,
          why: 'The config is read at startup. Standard tool: a rollout (redeployment) to make them re-read, cleanly decided.' },
        { q: 'Where do the SQL credentials of the tlx instance go?', pts: 10,
          opts: ['ConfigMap tlx-profile', 'Secret tlx-dbcreds', 'Into the container image', 'A PVC'], ans: 1,
          why: 'Secret for anything sensitive: values masked via describe, mounted as env or files, never in the image nor in git.' },
        { q: 'You delete a pod managed by a ReplicaSet. It comes back…', pts: 10,
          opts: ['with the same name, reading the fresh config', 'with a NEW name (hash), reading the fresh config', 'never', 'in a CrashLoop state'], ans: 1,
          why: "The ReplicaSet re-creates a pod — different hash, config reloaded. That is why \"delete pod\" is the admin method to make the config re-read." }
      ]},
      { type: 'text', blocks: [
        { h: 'Key takeaways', list: [
          'ConfigMap = profiles & non-sensitive parameters (the ex-default.pfl).',
          'Secret = anything that deserves a vault (passwords, SSFS, keys).',
          'Pods do not spontaneously re-read their config: re-creation or rollout is required.',
          'A pod in CrashLoopBackOff? kubectl logs → the cause is almost always spelled out black on white.'
        ]}
      ]}
    ]
  },

  /* ============================ 3.1 ============================ */
  {
    id: 'c3m1', ch: 3, dur: 20, badge: 'pompiers',
    title: 'Deployment: high availability without Pacemaker',
    glossary: ['Deployment', 'ReplicaSet', 'Self-healing'],
    steps: [
      { type: 'talk', lines: [
        { w: 'narr', t: "Before, for app server high availability: N AAS instances spread across VMs, a heartbeat, Pacemaker, scripts, stress, tickets." },
        { w: 'kubea', t: "Kubernetes integrates all of that. You declare \"I want 3 replicas of my AAS\" via a Deployment. A controller (ReplicaSet) keeps watch permanently: any drift is corrected. That is called self-healing." },
        { w: 'kubea', t: "Mission order: deploy the AAS, then I will cut a server to test the resurrection." }
      ]},
      { type: 'terminal', title: '3 AAS without revenue loss nor stress', world: 'haLab',
        brief: ['The aas-deploy.yml manifest declares: image nwas:7.50-sp22, 3 replicas, readiness probe on /health.',
          'Warning: at step 4, an incident will occur. Watch closely!'],
        tasks: [
          { t: 'Check that there is <b>not yet</b> a deployment', cmd: 'kubectl get deployments', match: '^kubectl\\s+get\\s+deployments?$', pts: 5, hint: 'kubectl get deployments' },
          { t: 'Create the Deployment tlx-aas', cmd: 'kubectl apply -f aas-deploy.yml', match: '^kubectl\\s+apply\\s+-f\\s+aas-deploy\\.yml$', pts: 10, hint: 'kubectl apply -f aas-deploy.yml' },
          { t: 'List the pods: note the extra-long names (hash)', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' }
        ],
        triggers: [
          { afterTask: 2, story: 'BOOM: the worker k8s-worker-02 died abruptly (hardware failure)!', run: w => {
            const n = w.nodes.find(x => x.name === 'k8s-worker-02');
            if (n) { n.status = 'NotReady'; n.taints = ['node.kubernetes.io/unreachable:NoSchedule']; }
            w.pods.forEach(p => { if (p.node === 'k8s-worker-02' && p.phase === 'Running') { p.phase = 'Terminating'; p.terminateAt = Date.now() + 900; } });
            if (w.narr) w.narr.push({ cls: 'err', t: '🔴 INCIDENT: the worker k8s-worker-02 just died abruptly (hardware failure). Watch what happens next…' });
          }}
        ],
        tasks2: [
          { t: 'List the <b>nodes</b>: the verdict is in', cmd: 'kubectl get nodes', match: '^kubectl\\s+get\\s+nodes?$', pts: 10, hint: 'kubectl get nodes' },
          { t: 'List the <b>pods</b>: how many are left? Who renewed the troop?', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?$', pts: 10, hint: 'kubectl get pods' },
          { t: 'Describe the <b>new pod</b> (the one born after the outage): who created it?', cmd: 'kubectl describe pod <name>', match: '^kubectl\\s+describe\\s+pod\\s+tlx-aas', pts: 10, hint: 'kubectl describe pod <new name>' },
          { t: 'Play the firefighter: <b>delete</b> any Running pod of your choice and watch it be reborn', cmd: 'kubectl delete pod <name>', match: '^kubectl\\s+delete\\s+pod\\s+tlx-aas', pts: 10, hint: 'kubectl delete pod <name-from-get-pods>' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Who re-created the pod killed by the worker-02 outage?', pts: 10,
          opts: ['The admin (you)', 'The ReplicaSet, controller of the Deployment', 'The DNS', 'Pacemaker'], ans: 1,
          why: "The ReplicaSet sees 2/3 replicas \"Running\" instead of 3 → it immediately re-creates where there is capacity. Nobody was woken up that night." },
        { q: 'The new pod created after the incident…', pts: 10,
          opts: ['bears the same name (service continuity)', 'bears a different name (new object, same image/config)', 'floats in the void', 'waits for Pacemaker'], ans: 1,
          why: 'New pod = new hash in the name. Continuity is provided by the Service (next chapter), not by identity.' },
        { q: 'What remains for you to do yourself, on the admin side, for AAS high availability?', pts: 10,
          opts: ['Write failover scripts', 'Nothing: stay exhausted by on-call', 'Declare the right number of replicas and check the probes', 'Build Pacemaker clusters'], ans: 2,
          why: "The admin shifts from \"firefighter\" to \"architect of intent\": right probes, right numbers, right config." }
      ]},
      { type: 'text', blocks: [
        { h: 'Role conversion', p: "In classic Basis, app server HA = the VM + Pacemaker + runbooks trio. In Kubernetes: the Deployment declares the desired state, the ReplicaSet executes. Your on-call engineer runbook loses 90% of its volume: the keyword is \"self-healing\"." },
        { tip: "Standard wording: \"deployment\" refers to the intent controller, \"ReplicaSet\" to the executor. Do not dwell on it: the Deployment manages its own ReplicaSet." }
      ]}
    ]
  },

  /* ============================ 3.2 ============================ */
  {
    id: 'c3m2', ch: 3, dur: 18,
    title: 'Services: announcing and distributing',
    glossary: ['Service', 'Endpoint', 'Internal DNS'],
    steps: [
      { type: 'talk', lines: [
        { w: 'narr', t: "Problem: the AAS are born, die and change IP at every re-creation. How do users (and RFCs) find them?" },
        { w: 'kubea', t: "In your world: the SAP Web Dispatcher pointed at stable VIPs. Here: the Service. Stable IP + internal DNS name + distribution across the READY pods (via the endpoints)." }
      ]},
      { type: 'text', blocks: [
        { h: 'The 4 types to know', def: [
          { t: 'ClusterIP (default)', d: 'Internal virtual IP + DNS: the internal network traffic of the landscape. Your RFCs between instances.' },
          { t: 'NodePort', d: 'Opens the same port on every node: handy for testing, not for clean production.' },
          { t: 'LoadBalancer', d: 'A public IP provided by the cloud: the VIP of your previous infra, in cloud version.' },
          { t: 'Ingress', d: 'HTTP/HTTPS routing by host & path: a modernized Fiori Launchpad (TLS included).' }
        ]}
      ]},
      { type: 'terminal', title: 'One Service, five app servers, zero toolbox', world: 'svcLab',
        brief: ['We create the service, we scale, and we watch the endpoints rewire themselves.'],
        tasks: [
          { t: 'Where do the <b>services</b> stand? (nothing: normal)', cmd: 'kubectl get svc', match: '^kubectl\\s+get\\s+(svc|service|services)$', pts: 5, hint: 'kubectl get svc' },
          { t: 'Create the Service <b>tlx-aas</b>', cmd: 'kubectl apply -f svc-aas.yml', match: '^kubectl\\s+apply\\s+-f\\s+svc-aas\\.yml$', pts: 10, hint: 'kubectl apply -f svc-aas.yml' },
          { t: 'Observe with <b>get svc</b>: stable ClusterIP assignment', cmd: 'kubectl get svc', match: '^kubectl\\s+get\\s+(svc|services)$', pts: 10, hint: 'kubectl get svc' },
          { t: 'How many <b>endpoints</b> plugged in? (describe)', cmd: 'kubectl describe svc tlx-aas', match: '^kubectl\\s+describe\\s+svc\\s+tlx-aas$', pts: 10, hint: 'kubectl describe svc tlx-aas' },
          { t: 'Go up to <b>5 replicas</b> of tlx-aas', cmd: 'kubectl scale …', match: '^kubectl\\s+scale\\s+(?:deployments?|deploy)(?:\\.apps)?(?:\\/|\\s+)tlx-aas\\s+--replicas=5$', pts: 10, hint: 'kubectl scale deploy tlx-aas --replicas=5' },
          { t: 'Re-check the <b>endpoints</b>: who updated the list?', cmd: 'kubectl describe svc tlx-aas', match: '^kubectl\\s+describe\\s+svc\\s+tlx-aas$', pts: 10, hint: 'kubectl describe svc tlx-aas' },
          { t: 'Test the distribution: curl from tlx-pas to <b>tlx-aas</b>', cmd: 'kubectl exec -it tlx-pas-… -- curl http://tlx-aas:8000/', match: '^kubectl\\s+exec\\s+(?:-it\\s+)?\\S+\\s+--\\s+curl\\s+http://tlx-aas', pts: 10, hint: 'kubectl exec -it tlx-pas -- curl http://tlx-aas:8000/' }
        ]},
      { type: 'quiz', qs: [
        { q: 'An AAS gets killed in the middle of the evening. The Service tlx-aas…', pts: 10,
          opts: ['sends its traffic to the dead pod', 'automatically switches traffic to the remaining ready pods', 'works because Pacemaker', 'restarts'], ans: 1,
          why: "The endpoints only contain \"ready\" pods (readiness OK). The dead pod is removed within seconds — with no intervention." },
        { q: 'Your ABAP RFCs between servers must stay strictly internal. Service type:', pts: 10,
          opts: ['LoadBalancer', 'NodePort', 'ClusterIP', 'ExternalName'], ans: 2,
          why: "ClusterIP: visible only inside the cluster network (the natural sapms of the Kubernetes datacenter)." },
        { q: 'Facing the world (browser, Launchpad), what handles TLS and routing by path:', pts: 10,
          opts: ['ClusterIP', 'NodePort', 'Ingress', 'CronJob'], ans: 2,
          why: "Ingress: TLS termination + routing \"fiori.airbus.com → web service\". Your certificates live there in a Secret." }
      ]},
      { type: 'text', blocks: [
        { h: 'The mental map', p: "Pod = short-lived IP · Service = stable IP + DNS + distribution · Ingress = the public door. You have just activated the VAN triplet (equiv. VIP/Web Dispatcher/SAPRouter) in 2 declarative objects." }
      ]}
    ]
  },

  /* ============================ 4.1 ============================ */
  {
    id: 'c4m1', ch: 4, dur: 18,
    title: 'The data demand a PersistentVolume',
    glossary: ['PersistentVolume', 'PVC', 'StorageClass'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "Big question of the day: Pods die often. How do /usr/sap/SID, the trace files, and above all untouchable HANA survive?" },
        { w: 'kubea', t: "Answer: storage is decoupled from the Pods. Three actors:" },
        { w: 'narr', t: "PersistentVolume (PV): the real disk, provisioned on the cluster side — your SAN/NFS array. PersistentVolumeClaim (PVC): the reservation made by the Pod (\"I need 200Gi\"). StorageClass: the backend that knows how to build a disk (SSD, NFS, block…)." }
      ]},
      { type: 'text', blocks: [
        { p: "Logical chain: the Pod requests a PVC → the PVC matches a StorageClass → the provisioner builds a PV → the volume is mounted into the Pod." },
        { table: { h: ['SAP universe', 'Kubernetes'], r: [
          ['SAN / NFS array', 'PersistentVolume (PV)'],
          ['LUN request', 'PersistentVolumeClaim (PVC)'],
          ['Storage model', 'StorageClass'],
          ['Mount /usr/sap/SID', 'volumeMounts in the Pod']
        ]}},
        { warn: "Key point: the PV survives the death of the Pod. Only the Pod dies, never the data's address book." }
      ]},
      { type: 'terminal', title: 'Reserving 200Gi for HANA', world: 'storageLab',
        brief: ['Reserve the system volume of the future HANA of the tlx namespace.'],
        tasks: [
          { t: 'Which <b>StorageClass</b> do we have?', cmd: 'kubectl get storageclass', match: '^kubectl\\s+get\\s+storageclass(es)?$', pts: 10, hint: 'kubectl get storageclass' },
          { t: 'No <b>PVC</b> for now', cmd: 'kubectl get pvc', match: '^kubectl\\s+get\\s+pvc', pts: 5, hint: 'kubectl get pvc' },
          { t: 'Request 200Gi with <b>pvc-hana.yml</b>', cmd: 'kubectl apply -f pvc-hana.yml', match: '^kubectl\\s+apply\\s+-f\\s+pvc-hana\\.yml$', pts: 10, hint: 'kubectl apply -f pvc-hana.yml' },
          { t: 'Check the <b>PVC</b>: status?', cmd: 'kubectl get pvc', match: '^kubectl\\s+get\\s+pvc', pts: 10, hint: 'kubectl get pvc' },
          { t: 'Look at the <b>PV</b> born behind it (cluster view)', cmd: 'kubectl get pv', match: '^kubectl\\s+get\\s+pv$', pts: 10, hint: 'kubectl get pv' },
          { t: 'Full sheet of the PVC', cmd: 'kubectl describe pvc tlx-hana-data', match: '^kubectl\\s+describe\\s+pvc\\s+tlx-hana-data$', pts: 10, hint: 'kubectl describe pvc tlx-hana-data' }
        ]},
      { type: 'quiz', qs: [
        { q: 'Who provisions the PV on demand ("dynamically")?', pts: 10,
          opts: ['The admin, by hand', 'The StorageClass via its provisioner', 'The DNS', 'The Secret'], ans: 1,
          why: "Dynamic provisioning: the StorageClass calls the cloud provisioner (azure-disk here) and builds the disk without an infra ticket." },
        { q: 'You delete the Pod that mounted tlx-hana-data. The volume…', pts: 10,
          opts: ['disappears', 'is archived for 1 h', 'SURVIVES (the data stays on the PV)', 'replicates itself'], ans: 2,
          why: 'Persistence: the PV is independent of the Pod life cycle. The next pod claiming this PVC mounts it as is.' },
        { q: 'A Pod writes into /usr/sap/SID which is NOT mounted on a persistent volume. What happens to the files? They are…', pts: 10,
          opts: ['replicated to the cloud', 'LOST as soon as the Pod dies', 'kept in permanent cache', 'sent to the DNS'], ans: 1,
          why: "Anything not on a volume is ephemeral: each Pod is born with a layer of blank disk (the image)."}
      ]},
      { type: 'text', blocks: [
        { h: 'Basis reflex 2.0', p: "Architect question #1 before any deployment: \"What is persistent?\" Answer as a list: /hana/data, /hana/log, /usr/sap, /sapmnt/trans (transports), the traces. Everything else can live in the image." }
      ]}
    ]
  },

  /* ============================ 4.2 ============================ */
  {
    id: 'c4m2', ch: 4, dur: 20, badge: 'gardien',
    title: 'StatefulSet: when identity matters',
    glossary: ['StatefulSet', 'Stable identity'],
    steps: [
      { type: 'talk', lines: [
        { w: 'kubea', t: "Deployments produce interchangeable twin pods, perfect for AAS. But HANA is not interchangeable: one PRIMARY, secondaries to synchronize, each with its journal and its data volume." },
        { w: 'kubea', t: "For those workloads: the StatefulSet. Numbered pods (tlx-hana-0, tlx-hana-1), ordered startup, dedicated PVC per pod, durable identity across restarts." }
      ]},
      { type: 'terminal', title: 'A well-organized HANA', world: 'stsLab',
        brief: ['The sts-hana.yml manifest creates tlx-hana with 2 replicas and one PVC per pod (claim template).'],
        tasks: [
          { t: 'Create the StatefulSet <b>tlx-hana</b>', cmd: 'kubectl apply -f sts-hana.yml', match: '^kubectl\\s+apply\\s+-f\\s+sts-hana\\.yml$', pts: 10, hint: 'kubectl apply -f sts-hana.yml' },
          { t: 'List the pods: the 0 first, then the 1… watch the order!', cmd: 'kubectl get pods -w', match: '^kubectl\\s+get\\s+pods?', pts: 10, hint: 'kubectl get pods' },
          { t: 'Logs of the <b>primary</b> tlx-hana-0', cmd: 'kubectl logs tlx-hana-0', match: '^kubectl\\s+logs\\s+tlx-hana-0$', pts: 10, hint: 'kubectl logs tlx-hana-0' }
        ],
        triggers: [
          { afterTask: 2, story: 'Kill the primary to verify continuity…', run: w => {
            const p = w.pods.find(x => x.name === 'tlx-hana-0' && x.phase === 'Running');
            if (p) { p.phase = 'Terminating'; p.terminateAt = Date.now() + 700; if (w.narr) w.narr.push({ cls: 'err', t: '🔴 The primary tlx-hana-0 has just been killed. Watch the recovery (no backup needed!)' }); }
          }}
        ],
        tasks2: [
          { t: 'A <b>short wait then</b>: the tlx-hana-0 pod reappears… under the SAME name?', cmd: 'kubectl get pods', match: '^kubectl\\s+get\\s+pods?', pts: 10, hint: 'kubectl get pods' },
          { t: 'Logs of the new <b>tlx-hana-0</b>: did the volume lose anything at all?', cmd: 'kubectl logs tlx-hana-0', match: '^kubectl\\s+logs\\s+tlx-hana-0$', pts: 10, hint: 'kubectl logs tlx-hana-0' }
        ]},
      { type: 'quiz', qs: [
        { q: 'The identity difference between Deployment and StatefulSet:', pts: 10,
          opts: ['Deployment = unstable names, StatefulSet = stable names (0,1,2…)', 'None', 'Deployment is faster', 'StatefulSet is older'], ans: 0,
          why: 'StatefulSet = identity (eternal .name-i + associated PVC) + ordered startup. Deployment = interchangeable cattle.' },
        { q: 'Match each workload to its ideal resource: tlx-aas (3 twin instances)? ', pts: 10,
          opts: ['StatefulSet', 'Deployment', 'Job', 'DaemonSet'], ans: 1,
          why: 'AAS = stateless, interchangeable → Deployment.' },
        { q: 'And HANA (primary + secondary)?', pts: 10,
          opts: ['Deployment', 'StatefulSet', 'CronJob', 'ConfigMap'], ans: 1,
          why: 'Well spotted: stable identity, ordered startup, one PVC per pod — exactly the HANA recipe (and ASCS).' },
        { q: 'After deleting the primary, the HANA data…', pts: 10,
          opts: ['are re-created empty', 'were replicated by DNS', 'are intact: the dedicated PVC is remounted as is', 'were backed up by Pacemaker'], ans: 2,
          why: "The StatefulSet re-opens everything the PVC inherited under the same name. The journals are replayed, recovery is immediate: 0 transactions lost." }
      ]},
      { type: 'text', blocks: [
        { h: 'The SAP landscape on Kubernetes, short version', list: [
          'HANA, ASCS/ERS → StatefulSet (identity + dedicated volumes).',
          'AAS/PAS stateless → Deployment (scale, rolling update).',
          'One-off/scheduled jobs (imports, batches) → Job / CronJob.'
        ]}
      ]}
    ]
  }
];
