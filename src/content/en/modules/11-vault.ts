import type { DevOpsModule } from "../../types";

export const vaultModuleEn: DevOpsModule = {
  id: "vault",
  codename: "Operation VAULT",
  title: "Protecting secrets",
  roadmapSection: "Secret Management",
  roadmapTopics: ["Secrets", "Never in Git", "Secrets vault (Vault)", "CI secrets", "Leaks and rotation"],
  briefing:
    "The vault room holds the keys to the entire infrastructure. ENTROPIA is trying to steal them. Learn how to protect them.",
  lessons: [
    {
      title: "What is a secret?",
      summary: "A secret is a piece of information that gives access: a password, an API key, a token, a certificate. If someone steals it, they can act on your behalf.",
      analogy: "They are your house keys: you do not leave them hanging in the front door.",
      keyPoint: "Password, API key, token: these are secrets.",
    },
    {
      title: "Never in the code or in Git",
      summary:
        "A secret written in the code ends up in Git, and Git keeps the whole history: even if you delete it later, it can still be recovered. Bots constantly scan GitHub looking for keys.",
      analogy: "It is like writing your credit card PIN on a sticky note and putting it up in a public place.",
      keyPoint: "Never write a secret in the code or in Git.",
    },
    {
      title: "The secrets vault",
      summary: "A secrets manager (HashiCorp Vault, AWS Secrets Manager...) stores secrets in encrypted form. The application asks it for them at startup, with controlled and tracked access.",
      analogy: "It is a bank vault: you get in with authorization, and every opening is recorded.",
      keyPoint: "Secrets belong in a dedicated vault (Vault...).",
    },
    {
      title: "Secrets in CI",
      summary:
        "Pipelines often need secrets (to deploy). GitHub and GitLab offer an encrypted \"Secrets\" area: the secret is injected at run time, and is never displayed or written into the repository.",
      analogy: "The delivery driver is given the gate code at the moment of delivery; it is not printed on the package.",
      keyPoint: "In CI, secrets go in the repository's Secrets area.",
    },
    {
      title: "When a leak happens",
      summary:
        "Did a secret leak? First revoke it (disable it), then create a new one, update the applications, and finally check whether anyone used it.",
      analogy: "You lost your keys: you change the lock first, and investigate afterward.",
      keyPoint: "Leak: revoke → replace → update → investigate.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "Which of these is a secret?",
      options: ["The site's name", "An API key", "The logo's color", "The version number"],
      correctIndex: 1,
      explanation: "An API key gives access to a service: it is a secret to protect.",
    },
    {
      kind: "choice",
      prompt: "Where should you NEVER put a password?",
      options: ["In a secrets vault", "In the code pushed to GitHub", "In the pipeline's Secrets", "In a password manager"],
      correctIndex: 1,
      explanation: "Git keeps the whole history: a password that was committed is considered compromised.",
    },
    {
      kind: "choice",
      prompt: "HashiCorp Vault is...",
      options: ["A video game", "A vault for storing and handing out secrets", "A web server", "A programming language"],
      correctIndex: 1,
      explanation: "Vault stores secrets in encrypted form and controls who can access them.",
    },
    {
      kind: "choice",
      prompt: "Your GitHub Actions pipeline needs a token to deploy. Where do you put it?",
      options: ["In the pipeline's YAML file", "In the GitHub repository's Secrets", "In the README", "In the branch name"],
      correctIndex: 1,
      explanation: "Repository Secrets are encrypted and injected at run time, and never appear in the code.",
    },
    {
      kind: "order",
      prompt: "An API key has leaked. Put the actions in order.",
      steps: ["Revoke the compromised key", "Create a new key", "Update the applications with the new key", "Check the logs for suspicious access"],
      explanation: "Cut off access first: every minute counts. Then fix things, then investigate.",
    },
  ],
};
