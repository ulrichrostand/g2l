import type { DevOpsModule } from "../../types";

export const nimbusModuleEn: DevOpsModule = {
  id: "nimbus",
  codename: "Operation NIMBUS",
  title: "The Cloud",
  roadmapSection: "Cloud Providers · Serverless",
  roadmapTopics: ["AWS / Azure / Google Cloud", "Pay as you go", "Regions & zones", "IAM", "Serverless"],
  briefing:
    "ENTROPIA has taken refuge in the public cloud. To track her down, you need to understand how servers are rented and secured from the big providers.",
  lessons: [
    {
      title: "What is the cloud?",
      summary:
        "The cloud means using computers that belong to someone else (Amazon with AWS, Microsoft with Azure, Google Cloud), over the Internet. No more buying and maintaining your own servers.",
      analogy: "It is renting a furnished apartment instead of building your own house: you move in right away.",
      keyPoint: "The cloud = renting computing resources from AWS, Azure, Google Cloud...",
    },
    {
      title: "Pay as you go",
      summary:
        "In the cloud, you pay for what you use, by the hour or by the second. You can add servers in a few minutes when it is busy, and remove them afterward.",
      analogy: "It is like electricity: you pay for what you use, not for the power plant.",
      keyPoint: "You pay as you go and adjust resources to your needs.",
    },
    {
      title: "Regions and zones",
      summary:
        "Providers have data centers all over the world, grouped into regions (for example Paris), which are themselves split into independent zones. Spreading your servers across several zones keeps a single failure from stopping everything.",
      analogy: "Do not put all your eggs in one basket: if one basket falls, the others are still there.",
      keyPoint: "Spreading across several zones protects against a data center failure.",
    },
    {
      title: "IAM: who is allowed to do what",
      summary:
        "IAM manages identities and permissions. The golden rule is least privilege: each person or application gets only the rights it needs, nothing more.",
      analogy: "The intern has a badge that opens their office, not the vault.",
      keyPoint: "Least privilege: give only the rights that are needed.",
    },
    {
      title: "Serverless",
      summary:
        "With serverless (AWS Lambda, Azure Functions...), you provide only your code. The provider runs it when needed and manages all the servers. You pay only while your code is running.",
      analogy: "It is taking a taxi instead of buying a car: no upkeep, you pay for the ride.",
      keyPoint: "Serverless: you provide the code, the provider manages the servers.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "AWS, Azure and Google Cloud are...",
      options: ["Programming languages", "Cloud providers", "Operating systems", "Antivirus programs"],
      correctIndex: 1,
      explanation: "They are the three biggest cloud providers in the world.",
    },
    {
      kind: "choice",
      prompt: "What is the main advantage of the cloud?",
      options: [
        "It is always free",
        "You pay as you go and can add resources in a few minutes",
        "You no longer need the Internet",
        "You never have an outage again",
      ],
      correctIndex: 1,
      explanation: "Flexibility and pay-as-you-go. Careful: outages still happen, so you need to prepare for them.",
    },
    {
      kind: "choice",
      prompt: "How do you keep your site up if an entire data center goes down?",
      options: ["Buy a bigger server", "Spread the servers across several zones", "Change your password", "Restart more often"],
      correctIndex: 1,
      explanation: "Several independent zones = if one goes down, the others take over.",
    },
    {
      kind: "choice",
      prompt: "An application only needs to read files. What rights should you give it?",
      options: ["Full administrator, it is simpler", "Only read access to those files", "No rights at all", "The same as the boss"],
      correctIndex: 1,
      explanation: "Least privilege: if the application is hacked, the attacker will not be able to do more than read.",
    },
    {
      kind: "choice",
      prompt: "With serverless...",
      options: [
        "There is no computer anywhere",
        "You provide your code and the provider manages the servers",
        "You have to install Linux yourself",
        "Your code runs all the time, even with no visitors",
      ],
      correctIndex: 1,
      explanation: "The servers exist, but they are no longer your problem: you pay only for the code execution.",
    },
  ],
};
