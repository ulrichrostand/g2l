import type { DevOpsModule } from "../../types";

export const blueprintModuleEn: DevOpsModule = {
  id: "blueprint",
  codename: "Operation BLUEPRINT",
  title: "Infrastructure as code (Terraform)",
  roadmapSection: "Provisioning",
  roadmapTopics: ["Infrastructure as Code", "Terraform", "init / plan / apply", "State", "Drift"],
  briefing:
    "The infrastructure blueprints have been stolen. Rebuild it the right way: described in files, and reproducible exactly the same every time.",
  lessons: [
    {
      title: "Infrastructure as Code (IaC)",
      summary:
        "Instead of creating servers and networks by clicking around in a console, you describe them in text files. Then you can recreate them exactly the same way, keep them in Git, and have them reviewed by others.",
      analogy: "It is an architect's blueprint: with the same plan, you can build the exact same house as many times as you like.",
      keyPoint: "IaC: the infrastructure is described in code files.",
    },
    {
      title: "Terraform",
      summary:
        "Terraform is the most widely used IaC tool. In `.tf` files, you describe what you want (\"2 servers, 1 database\"), and Terraform creates it for you at the cloud provider.",
      analogy: "You hand your order to a caterer, and they take care of preparing everything.",
      keyPoint: "Terraform creates the infrastructure described in .tf files.",
    },
    {
      title: "init, plan, apply",
      summary:
        "Three commands to know: `terraform init` gets the project ready, `terraform plan` shows what WILL change without touching anything, and `terraform apply` makes the changes.",
      analogy: "It is like checking your cart before you pay: `plan` shows the cart, `apply` goes to the checkout.",
      example: { code: "terraform plan", meaning: "Shows the planned changes, without modifying anything." },
      keyPoint: "terraform init → plan (preview) → apply (make the changes).",
    },
    {
      title: "The state",
      summary:
        "Terraform keeps a state file that lists everything it has created. That is how it knows what already exists and what it needs to change.",
      analogy: "It is the store's inventory: without it, there is no way to know what is already on the shelves.",
      keyPoint: "The state remembers what Terraform has created.",
    },
    {
      title: "Never change things by hand",
      summary:
        "If someone changes a server directly in the console, the code no longer matches reality: this is called drift. The rule: every change goes through the code and a review.",
      analogy: "If a worker moves a wall without updating the plan, the next house you build from it will be wrong.",
      keyPoint: "Changing things by hand creates drift: everything goes through the code.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "Infrastructure as Code means...",
      options: ["Writing a web application", "Describing servers and networks in code files", "Programming a robot", "Installing Windows"],
      correctIndex: 1,
      explanation: "The infrastructure becomes reproducible, versioned, and reviewed just like code.",
    },
    {
      kind: "choice",
      prompt: "With Terraform, what do you describe in your .tf files?",
      options: [
        "What you want to end up with (servers, networks...), and Terraform creates it",
        "The colors of your website",
        "The list of bugs to fix",
        "The emails to send to customers",
      ],
      correctIndex: 0,
      explanation: "Terraform is declarative: you describe the result you want, and it works out and carries out the steps to get there.",
    },
    {
      kind: "command",
      prompt: "Show what Terraform is going to change, without modifying anything.",
      acceptedAnswers: ["terraform plan"],
      hint: "terraform followed by the word for a preview of the plan.",
      explanation: "`terraform plan` is a safe preview. The usual order is `init`, then `plan`, then `apply`.",
    },
    {
      kind: "choice",
      prompt: "What is Terraform's state file for?",
      options: ["Storing the application's code", "Remembering what Terraform has created", "Encrypting the network", "Sending emails"],
      correctIndex: 1,
      explanation: "The state is Terraform's inventory: it compares what exists with what the code describes.",
    },
    {
      kind: "choice",
      prompt: "A coworker changes a server directly in the cloud console. What is the problem?",
      options: ["There is no problem", "The code no longer matches reality (drift)", "The server gets faster", "Terraform gets deleted"],
      correctIndex: 1,
      explanation: "Drift makes the infrastructure unpredictable. Every change must go through the code.",
    },
  ],
};
