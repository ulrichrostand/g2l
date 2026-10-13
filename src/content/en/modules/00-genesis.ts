import type { DevOpsModule } from "../../types";

export const genesisModuleEn: DevOpsModule = {
  id: "genesis",
  codename: "Operation GENESIS",
  title: "Welcome to DevOps",
  roadmapSection: "Introduction",
  roadmapTopics: ["Server", "Dev & Ops", "Terminal", "Automation", "Delivery cycle"],
  briefing:
    "Training mission, Spectre. Before you face ENTROPIA, you need to understand what DevOps is. Pick up the yellow files: each one explains an idea in simple terms. Then hack the terminals to check that you got it. Sneak up behind the sentinels to take them down.",
  lessons: [
    {
      title: "What is a server?",
      summary:
        "A server is a computer that provides a service to other computers, non-stop, 24/7. When you open a website, your phone asks a server for the page, and the server sends it back.",
      analogy:
        "A server is like the kitchen of a restaurant: the customers (your browser) place an order, and the kitchen (the server) prepares the dish and sends it back (the web page).",
      keyPoint: "A server is a computer that provides a service (website, database...) non-stop.",
    },
    {
      title: "Dev + Ops = DevOps",
      summary:
        "\"Devs\" (developers) write the code. \"Ops\" (operations) keep it running on the servers. In the past, these two teams worked on their own and blamed each other when things broke. DevOps is a way of working together and automating to deliver faster and more safely.",
      analogy:
        "Imagine cooks and waiters who never talk to each other: the food arrives cold. DevOps means getting them to work as one team, with tools that make everything flow.",
      keyPoint: "DevOps is a culture of collaboration between development and operations, backed by automation.",
    },
    {
      title: "The terminal",
      summary:
        "The terminal is a window where you type commands instead of clicking. Servers often have no screen or mouse: you control them with commands. The `echo` command simply displays some text.",
      analogy: "Clicking is like pointing at a menu. The terminal is talking directly to the computer with precise sentences.",
      example: { code: 'echo "Hello"', meaning: "Displays the word Hello on the screen." },
      keyPoint: "The terminal lets you control a computer (especially a server) by typing commands.",
    },
    {
      title: "Automate",
      summary:
        "A task you repeat by hand will eventually be forgotten or done wrong. The DevOps reflex: write a script (a list of commands) that does it automatically, the same way every time.",
      analogy: "Instead of making your coffee by hand every morning, you program the coffee maker: same result, no effort, nothing forgotten.",
      keyPoint: "If a task repeats, automate it with a script or a tool.",
    },
    {
      title: "Ship often, in small pieces",
      summary:
        "A new feature always follows the same cycle: you plan, code, test, deploy (put it online), then monitor that everything is fine. In DevOps, you repeat this cycle very often, with small changes that are easy to check.",
      analogy: "It is better to deliver pizzas one at a time, piping hot, than one huge banquet once a year where everything can go wrong at once.",
      keyPoint: "DevOps cycle: plan → code → test → deploy → monitor, in small, frequent steps.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is a server?",
      options: [
        "A computer that provides a service (like a website) non-stop",
        "A cable that connects two computers",
        "A drawing program",
        "An administrator password",
      ],
      correctIndex: 0,
      explanation: "A server provides a service to other machines, day and night. Websites, apps and online games all run on servers.",
    },
    {
      kind: "choice",
      prompt: "DevOps is first and foremost...",
      options: [
        "A programming language",
        "A way to get developers and operations to work together, with automation",
        "A computer brand",
        "An antivirus",
      ],
      correctIndex: 1,
      explanation: "DevOps is not a tool but a way of working: collaboration + automation, to ship fast and without breaking things.",
    },
    {
      kind: "command",
      prompt: "Your turn: type the command that displays the word Hello.",
      acceptedAnswers: ['echo "Hello"', "echo Hello"],
      hint: "Re-read the \"The terminal\" file: the command starts with echo.",
      explanation: "`echo` displays the text you give it. It is the simplest command, and scripts use it all the time to print messages.",
    },
    {
      kind: "choice",
      prompt: "Every morning, you restart a service by hand by typing the same 5 commands. What is the DevOps reflex?",
      options: ["Keep going, it is safer", "Write a script that does it automatically", "Ask someone else to do it", "Stop restarting the service"],
      correctIndex: 1,
      explanation: "A repetitive task is a task to automate. The script always does exactly the same thing, with no omissions and no typos.",
    },
    {
      kind: "order",
      prompt: "Put the life cycle of a new feature in order.",
      steps: ["Plan", "Code", "Test", "Deploy (put it online)", "Monitor"],
      explanation: "This cycle repeats in a loop. DevOps aims to make it fast and reliable through automation.",
    },
  ],
};
