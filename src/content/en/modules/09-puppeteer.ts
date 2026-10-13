import type { DevOpsModule } from "../../types";

export const puppeteerModuleEn: DevOpsModule = {
  id: "puppeteer",
  codename: "Operation PUPPETEER",
  title: "Configuring servers at scale (Ansible)",
  roadmapSection: "Configuration Management",
  roadmapTopics: ["Configuration management", "Ansible", "Inventory", "Playbook", "Idempotence"],
  briefing:
    "ENTROPIA has thrown hundreds of servers out of whack. There is no way to fix them one by one: you need a conductor.",
  lessons: [
    {
      title: "Configuring 100 servers",
      summary:
        "Installing and setting up one server by hand takes time; setting up a hundred without mistakes is impossible. A configuration management tool automatically applies the same settings everywhere.",
      analogy: "A conductor directs all the musicians at the same time instead of visiting each one in turn.",
      keyPoint: "Configuration management automatically sets up lots of servers the same way.",
    },
    {
      title: "Ansible",
      summary:
        "Ansible is the easiest tool to start with. It connects to servers over SSH, without installing anything on them, and applies what you have described in YAML files (a readable text format).",
      analogy: "It uses the usual front door (SSH) instead of asking for a special door to be installed.",
      keyPoint: "Ansible works over SSH, with no agent to install, and is described in YAML.",
    },
    {
      title: "The inventory",
      summary: "The inventory is the list of servers Ansible manages, often split into groups: the web servers, the databases...",
      analogy: "It is the servers' address book.",
      keyPoint: "The inventory lists the servers to manage.",
    },
    {
      title: "The playbook",
      summary:
        "A playbook is a YAML file that lists tasks: install nginx, copy a file, start a service. You run it with `ansible-playbook -i inventory playbook.yml`.",
      analogy: "It is the sheet music the conductor has all the musicians play.",
      example: { code: "ansible-playbook -i inventory.ini site.yml", meaning: "Applies the site.yml playbook to the servers in the inventory." },
      keyPoint: "A YAML playbook lists the tasks; `ansible-playbook -i inventory file.yml` runs it.",
    },
    {
      title: "Idempotence",
      summary:
        "An idempotent task checks before it acts: if nginx is already installed, it does nothing. So you can rerun a playbook as many times as you like without breaking anything.",
      analogy: "A \"turn on\" button (not a \"toggle\" button): pressing it twice leaves the light on.",
      keyPoint: "Idempotent: running it again gives the same result, with no unwanted side effects.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "Why use a tool like Ansible?",
      options: [
        "To draw the architecture",
        "To automatically configure lots of servers the same way",
        "To write web pages",
        "To host videos",
      ],
      correctIndex: 1,
      explanation: "Automating configuration prevents oversights and differences between servers.",
    },
    {
      kind: "choice",
      prompt: "How does Ansible connect to servers?",
      options: ["Over SSH, with no agent to install", "With a USB stick", "By email", "By Bluetooth"],
      correctIndex: 0,
      explanation: "Ansible uses SSH, which is already on Linux servers: nothing to install.",
    },
    {
      kind: "choice",
      prompt: "What is the Ansible inventory?",
      options: ["The list of servers to manage", "The list of passwords", "An error log", "The application's code"],
      correctIndex: 0,
      explanation: "The inventory tells Ansible which servers to work on.",
    },
    {
      kind: "command",
      prompt: "Run the site.yml playbook on the servers in the inventory.ini inventory.",
      acceptedAnswers: ["ansible-playbook -i inventory.ini site.yml", "ansible-playbook site.yml -i inventory.ini"],
      hint: "ansible-playbook -i <inventory> <playbook>",
      explanation: "`ansible-playbook -i inventory.ini site.yml` applies the playbook's tasks to every server listed.",
    },
    {
      kind: "choice",
      prompt: "A playbook is idempotent. What happens if you run it again?",
      options: ["It breaks everything", "It only redoes what is missing, and the result stays the same", "It installs everything twice", "It deletes the servers"],
      correctIndex: 1,
      explanation: "Idempotence makes automation safe: you can rerun it without worry.",
    },
  ],
};
