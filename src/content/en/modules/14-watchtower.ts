import type { DevOpsModule } from "../../types";

export const watchtowerModuleEn: DevOpsModule = {
  id: "watchtower",
  codename: "Operation WATCHTOWER",
  title: "Watching: monitoring, logs, alerts",
  roadmapSection: "Infrastructure Monitoring · Logs Management · Observability",
  roadmapTopics: ["Monitoring", "Metrics (Prometheus, Grafana)", "Logs", "Alerts", "Traces"],
  briefing:
    "ENTROPIA operates in the shadows because nobody is watching anything. Set up the watchtower so you can see every move.",
  lessons: [
    {
      title: "Monitoring",
      summary: "Monitoring means constantly measuring the health of servers and applications, so you can spot a problem before your users do.",
      analogy: "It is a car's dashboard: speed, fuel, engine temperature.",
      keyPoint: "Monitoring continuously watches the health of the system.",
    },
    {
      title: "Metrics",
      summary:
        "A metric is a number measured over time: processor usage, memory, visitors per second. Prometheus collects these numbers, and Grafana displays them as graphs.",
      analogy: "Prometheus is the thermometer that writes down the temperature every minute, and Grafana is the chart hanging on the wall.",
      keyPoint: "Prometheus collects metrics, Grafana displays them.",
    },
    {
      title: "Logs",
      summary:
        "Logs tell you what is happening, line by line: \"user logged in\", \"payment error\"... You gather them in a single tool (ELK, Loki) so they are easy to search.",
      analogy: "It is the captain's logbook, written up hour by hour.",
      keyPoint: "Logs tell the story of events; you centralize them to search them.",
    },
    {
      title: "Alerts",
      summary:
        "An alert warns the team when something is wrong. Good practice: alert on what users experience (the site is slow, returns errors), not on every little spike.",
      analogy: "A smoke detector should go off for a fire, not every time you burn the toast.",
      keyPoint: "Alert on what users experience, not on every detail.",
    },
    {
      title: "Traces",
      summary:
        "A request can pass through 10 services. A trace follows its full journey and shows the time spent in each one: you spot the slow service right away.",
      analogy: "It is package tracking: you see every step and where it got stuck.",
      keyPoint: "A trace follows a request from service to service to find what slows it down.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "Why do monitoring?",
      options: ["To decorate the office", "To detect problems before users do", "To write code faster", "To replace tests"],
      correctIndex: 1,
      explanation: "Monitoring gives you a real-time view of the system's health.",
    },
    {
      kind: "choice",
      prompt: "Which duo is a classic for metrics?",
      options: ["Git and GitHub", "Prometheus (collection) and Grafana (display)", "Docker and Nginx", "SSH and DNS"],
      correctIndex: 1,
      explanation: "Prometheus measures and stores, Grafana draws the dashboards.",
    },
    {
      kind: "choice",
      prompt: "What do logs contain?",
      options: ["Passwords", "The story of events, line by line", "The site's images", "The source code"],
      correctIndex: 1,
      explanation: "Logs are the logbook: essential for understanding an error.",
    },
    {
      kind: "choice",
      prompt: "Which alert deserves to wake the team up at night?",
      options: [
        "The processor hit 70% for 10 seconds",
        "The site is returning errors to a large share of users",
        "A new commit was pushed",
        "It is midnight",
      ],
      correctIndex: 1,
      explanation: "You alert on user impact. Too many pointless alerts and nobody pays attention anymore.",
    },
    {
      kind: "choice",
      prompt: "A page takes 5 seconds to load and goes through 6 services. Which tool shows which one is slow?",
      options: ["Traces (tracing)", "A ping", "The firewall", "Git"],
      correctIndex: 0,
      explanation: "The trace shows the time spent in each service: the culprit jumps out.",
    },
  ],
};
