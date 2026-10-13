import type { DevOpsModule } from "../../types";

export const syncModuleEn: DevOpsModule = {
  id: "sync",
  codename: "Operation SYNC",
  title: "GitOps and microservices",
  roadmapSection: "GitOps · Service Mesh",
  roadmapTopics: ["GitOps", "ArgoCD / Flux", "Rollback", "Microservices", "Service mesh"],
  briefing:
    "ENTROPIA is quietly tampering with the cluster and spying on the traffic between services. Make Git the single source of truth and secure internal communications.",
  lessons: [
    {
      title: "GitOps",
      summary:
        "With GitOps, the desired state of the infrastructure is described in a Git repository. To change something, you do not touch the servers: you change the repository (through a Pull Request).",
      analogy: "The Git repository is the official sheet music: if a musician starts improvising, they get brought back to the score.",
      keyPoint: "GitOps: Git is the source of truth for the infrastructure.",
    },
    {
      title: "ArgoCD and Flux",
      summary:
        "ArgoCD or Flux run inside the cluster and constantly compare what is in Git with what is really running. If there is a difference, they fix it automatically.",
      analogy: "It is a thermostat: it compares the temperature you want with the real one, and corrects the gap.",
      keyPoint: "ArgoCD/Flux automatically sync the cluster with Git.",
    },
    {
      title: "Rolling back easily",
      summary:
        "An update causes trouble? You undo the faulty commit in Git (`git revert`), and the GitOps tool automatically puts the previous version back.",
      analogy: "It is the \"undo\" button for your whole infrastructure.",
      keyPoint: "A rollback in GitOps = undo the commit in Git (git revert).",
    },
    {
      title: "Microservices",
      summary:
        "Instead of one big application, you can split it into small independent services (payment, catalog, accounts...), each deployed separately. They talk to each other over the network.",
      analogy: "A restaurant with specialized stations (pastry, grill...) instead of a single cook who does everything.",
      keyPoint: "Microservices: an application split into small independent services.",
    },
    {
      title: "The service mesh",
      summary:
        "When dozens of services talk to each other, a service mesh (Istio, Linkerd) manages those communications: it encrypts them, retries on failure, and measures everything.",
      analogy: "It is the company's internal mail room: it delivers, secures, and tracks every letter between services.",
      keyPoint: "A service mesh manages and secures communication between services.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "In GitOps, how do you change the infrastructure?",
      options: ["By logging in to the servers and changing everything by hand", "By changing the Git repository", "By sending an email", "By restarting the cluster"],
      correctIndex: 1,
      explanation: "Git is the source of truth: you change the repository, and the GitOps tool applies it.",
    },
    {
      kind: "choice",
      prompt: "What does ArgoCD do?",
      options: ["It writes the tests", "It automatically syncs the cluster with what is in Git", "It hosts the code", "It replaces Docker"],
      correctIndex: 1,
      explanation: "ArgoCD continuously compares Git and the cluster and fixes any differences.",
    },
    {
      kind: "choice",
      prompt: "The latest update breaks the site. In GitOps, how do you roll back?",
      options: ["Delete the cluster", "Undo the faulty commit in Git (git revert)", "Wait for it to pass", "Edit production by hand"],
      correctIndex: 1,
      explanation: "You undo it in Git, and the previous version is redeployed automatically.",
    },
    {
      kind: "choice",
      prompt: "A microservices architecture is...",
      options: ["One single big program", "An application split into small independent services", "A miniature server", "A type of cable"],
      correctIndex: 1,
      explanation: "Each service can be developed, deployed, and scaled separately.",
    },
    {
      kind: "choice",
      prompt: "What is a service mesh for?",
      options: ["Managing and securing communication between services", "Drawing diagrams", "Storing images", "Compiling code"],
      correctIndex: 0,
      explanation: "Encryption, retries, measurements: the mesh takes care of the network between services.",
    },
  ],
};
