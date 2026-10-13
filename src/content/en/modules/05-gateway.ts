import type { DevOpsModule } from "../../types";

export const gatewayModuleEn: DevOpsModule = {
  id: "gateway",
  codename: "Operation GATEWAY",
  title: "Web Servers and Traffic Distribution",
  roadmapSection: "What is and how to setup X?",
  roadmapTopics: ["Web server (Nginx)", "Reverse proxy", "Load balancer", "Cache", "Firewall"],
  briefing:
    "Every visit to Helix Corp goes through a compromised gateway. Understand the role of each piece of equipment to put it back in order.",
  lessons: [
    {
      title: "The web server",
      summary:
        "A web server (Nginx, Apache) is the program that answers browsers and sends them pages. Before reloading its configuration, you check it with `nginx -t` so you do not break everything.",
      analogy: "It is the clerk at the counter: you ask for a document, and they hand it to you.",
      example: { code: "nginx -t", meaning: "Checks that the Nginx configuration contains no errors." },
      keyPoint: "Nginx and Apache are web servers; `nginx -t` checks the configuration.",
    },
    {
      title: "The reverse proxy",
      summary:
        "A reverse proxy sits in front of the applications. It receives all the visits and directs them to the right service (the website, the API...). It often handles HTTPS too.",
      analogy: "It is a hotel receptionist: they welcome every visitor and send them to the right floor.",
      keyPoint: "A reverse proxy receives visits and redirects them to the right service.",
    },
    {
      title: "The load balancer",
      summary:
        "When a single server is no longer enough, you add several. The load balancer distributes visitors among them, and stops sending people to a server that is down.",
      analogy: "It is the supermarket employee who steers customers to the open checkout lanes.",
      keyPoint: "A load balancer spreads traffic across several servers.",
    },
    {
      title: "The cache",
      summary:
        "The cache keeps a copy of frequently requested responses, to send them back instantly without redoing all the work. The result: a faster site and less loaded servers.",
      analogy: "The restaurant prepares its most-ordered dishes in advance: they are served right away.",
      keyPoint: "The cache keeps copies so it can answer faster.",
    },
    {
      title: "The firewall",
      summary:
        "The firewall blocks all traffic except what you explicitly allow. For a website: you open 80 and 443 to the public, and SSH (22) only from trusted addresses.",
      analogy: "It is the bouncer at the nightclub: by default nobody gets in, except those on the list.",
      keyPoint: "Firewall: block everything by default, open only what is needed.",
    },
  ],
  challenges: [
    {
      kind: "command",
      prompt: "You changed the Nginx configuration. Check that it contains no errors before reloading it.",
      acceptedAnswers: ["nginx -t"],
      hint: "nginx followed by the -t (test) option.",
      explanation: "`nginx -t` tests the configuration. Reloading a broken configuration would take the site down.",
    },
    {
      kind: "choice",
      prompt: "Which piece of equipment receives visitors and sends them to the right service, like a receptionist?",
      options: ["The reverse proxy", "The hard drive", "DNS", "The browser cache"],
      correctIndex: 0,
      explanation: "The reverse proxy is the single front door that routes each request.",
    },
    {
      kind: "choice",
      prompt: "Your site gets too many visitors for a single server. What do you set up?",
      options: ["A stricter firewall", "Several servers behind a load balancer", "A longer password", "A new domain name"],
      correctIndex: 1,
      explanation: "The load balancer spreads the load across several servers and routes around the ones that are down.",
    },
    {
      kind: "choice",
      prompt: "What is a cache for?",
      options: ["To encrypt data", "To keep a copy of frequent responses so it can answer faster", "To save passwords", "To block attacks"],
      correctIndex: 1,
      explanation: "The cache avoids redoing the same work: instant answers and relieved servers.",
    },
    {
      kind: "choice",
      prompt: "Which firewall rule is right for a public web server?",
      options: [
        "Open everything, it is simpler",
        "Block everything, except 80 and 443 for everyone and SSH for a few trusted addresses",
        "Open only port 22 to everyone",
        "Turn off the firewall",
      ],
      correctIndex: 1,
      explanation: "You block by default and open only what is strictly necessary: this is the principle of least privilege.",
    },
  ],
};
