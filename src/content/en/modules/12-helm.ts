import type { DevOpsModule } from "../../types";

export const helmModuleEn: DevOpsModule = {
  id: "helm",
  codename: "Operation HELM",
  title: "Kubernetes: orchestrating containers",
  roadmapSection: "Container Orchestration",
  roadmapTopics: ["Kubernetes", "Pod", "Deployment", "Service", "kubectl"],
  briefing:
    "Helix Corp's main cluster runs thousands of containers. The sentinels are now Kubernetes pods. New gadget: `kubectl delete pod` (Q key).",
  lessons: [
    {
      title: "Why Kubernetes?",
      summary:
        "Managing 3 containers by hand is fine. Managing hundreds across many servers is not. Kubernetes (K8s) places them on servers, restarts them if they crash, and adds more when it gets busy.",
      analogy: "It is the site foreman who assigns the workers and instantly replaces anyone who is absent.",
      keyPoint: "Kubernetes orchestrates (automatically manages) containers across many servers.",
    },
    {
      title: "The pod",
      summary: "The pod is the smallest unit in Kubernetes: it holds one container (sometimes several, tightly linked).",
      analogy: "The pod is the pea pod, and the containers are the little peas inside.",
      keyPoint: "The pod is the smallest unit: it holds one or more containers.",
    },
    {
      title: "The Deployment",
      summary:
        "A Deployment says \"I want 3 copies of my application\". Kubernetes watches constantly: if a pod dies, it creates a new one right away to get back to 3.",
      analogy: "It is a thermostat: you set the temperature you want, and it corrects any drift on its own.",
      keyPoint: "A Deployment keeps the requested number of pods running.",
    },
    {
      title: "The Service",
      summary:
        "Pods are born and die, and their address changes. A Service gives you a stable address that sends traffic to the pods that are available.",
      analogy: "It is the company switchboard: you call a single number, and it transfers you to someone who is available.",
      keyPoint: "A Service provides a stable address for a group of pods.",
    },
    {
      title: "kubectl, the remote control (your new gadget)",
      summary:
        "`kubectl` is the Kubernetes command-line tool. `kubectl get pods` lists the pods, `kubectl logs name` shows their logs, and `kubectl delete pod name` deletes a pod.",
      analogy: "It is the universal remote control for the cluster.",
      example: { code: "kubectl get pods", meaning: "Lists the pods and their status." },
      keyPoint: "`kubectl get pods` lists the pods; `kubectl delete pod <name>` deletes one.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is Kubernetes for?",
      options: ["Writing code", "Automatically managing containers across many servers", "Sending emails", "Replacing Git"],
      correctIndex: 1,
      explanation: "Kubernetes places, monitors, restarts, and multiplies containers automatically.",
    },
    {
      kind: "choice",
      prompt: "What is the smallest unit in Kubernetes?",
      options: ["The server", "The pod", "The cluster", "The Service"],
      correctIndex: 1,
      explanation: "The pod holds one or more containers. You never run a \"bare\" container in K8s.",
    },
    {
      kind: "choice",
      prompt: "Your Deployment asks for 3 pods. One of them crashes. What does Kubernetes do?",
      options: ["Nothing", "It automatically creates a new one", "It stops the other two", "It texts you and waits"],
      correctIndex: 1,
      explanation: "The Deployment always brings the number of pods back to the number requested: that is self-healing.",
    },
    {
      kind: "choice",
      prompt: "What is a Kubernetes Service for?",
      options: ["Storing files", "Giving a stable address to reach a group of pods", "Compiling code", "Creating users"],
      correctIndex: 1,
      explanation: "Pods change addresses all the time; the Service stays fixed.",
    },
    {
      kind: "command",
      prompt: "List the pods in the cluster.",
      acceptedAnswers: ["kubectl get pods", "kubectl get pod", "kubectl get po"],
      hint: "kubectl get ...",
      explanation: "`kubectl get pods` shows each pod with its status (Running, CrashLoopBackOff...).",
    },
  ],
};
