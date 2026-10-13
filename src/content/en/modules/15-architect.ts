import type { DevOpsModule } from "../../types";

export const architectModuleEn: DevOpsModule = {
  id: "architect",
  codename: "Operation ARCHITECT",
  title: "Designing a solid infrastructure",
  roadmapSection: "Cloud Design Patterns",
  roadmapTopics: ["High availability", "Scalability", "Backups", "Circuit breaker", "Availability target"],
  briefing:
    "Final mission: the heart of ENTROPIA. To shut it down for good, design an infrastructure that can no longer go down.",
  lessons: [
    {
      title: "No single point of failure",
      summary:
        "If one single element (a server, a database) can stop everything by going down, it is a single point of failure. You duplicate everything that is critical.",
      analogy: "The spare tire: if a tire blows out, the car can still get going again.",
      keyPoint: "Duplicate critical elements to avoid a single point of failure.",
    },
    {
      title: "Growing: scalability",
      summary:
        "To handle more visitors, you can get a more powerful server (vertical scaling) or add more servers (horizontal scaling). Horizontal scaling has almost no limit.",
      analogy: "Vertical: a bigger truck. Horizontal: more trucks.",
      keyPoint: "Horizontal scaling = adding servers; vertical = one bigger server.",
    },
    {
      title: "Backups",
      summary:
        "A backup is only worth something if you know how to restore it. Keep several copies, including one somewhere else, and regularly test the restore.",
      analogy: "A spare parachute you have never checked is just a backpack.",
      keyPoint: "A backup must be tested regularly by restoring it.",
    },
    {
      title: "The circuit breaker",
      summary:
        "If a service you call is down, hammering it only makes things worse. The circuit breaker temporarily cuts the calls, returns a fallback response, then tries again later.",
      analogy: "The electrical circuit breaker: it cuts the power to prevent a fire.",
      keyPoint: "The circuit breaker cuts calls to a failing service to avoid a domino effect.",
    },
    {
      title: "Availability target",
      summary:
        "You set a measurable target, for example 99.9% availability. That allows about 43 minutes of downtime per month. Aiming for 100% is impossible and far too expensive.",
      analogy: "A train that is \"on time 99% of the time\" is a clear goal you can measure.",
      keyPoint: "99.9% availability = about 43 minutes of downtime allowed per month.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is a single point of failure?",
      options: ["An element whose failure stops the whole system", "The fastest server", "A forgotten password", "A bug in the interface"],
      correctIndex: 0,
      explanation: "You remove it by duplicating the element (two servers, two replicated databases...).",
    },
    {
      kind: "choice",
      prompt: "Horizontal scaling means...",
      options: ["Buying a bigger server", "Adding more servers", "Reducing the number of users", "Changing programming language"],
      correctIndex: 1,
      explanation: "Adding machines behind a load balancer: this is how big sites handle millions of visitors.",
    },
    {
      kind: "choice",
      prompt: "What is the golden rule of backups?",
      options: ["Make them once a year", "Regularly test that you can restore them", "Keep them on the same server", "Never check them"],
      correctIndex: 1,
      explanation: "Many companies discover on the day of disaster that their backups are unusable.",
    },
    {
      kind: "choice",
      prompt: "A payment service stops responding. What does a circuit breaker do?",
      options: [
        "It retries nonstop",
        "It temporarily cuts the calls and returns a fallback response",
        "It restarts all the servers",
        "It deletes the service",
      ],
      correctIndex: 1,
      explanation: "It keeps one service's failure from taking down every service that calls it.",
    },
    {
      kind: "choice",
      prompt: "A 99.9% availability target allows roughly how much downtime per month?",
      options: ["4 minutes", "43 minutes", "7 hours", "3 days"],
      correctIndex: 1,
      explanation: "0.1% of a month is about 43 minutes. At 99.99%, you drop to about 4 minutes.",
    },
  ],
};
