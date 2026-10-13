import type { DevOpsModule } from "../../types";

export const branchModuleEn: DevOpsModule = {
  id: "branch",
  codename: "Operation BRANCH",
  title: "Git: the History of Your Code",
  roadmapSection: "Version Control Systems · VCS Hosting",
  roadmapTopics: ["Git", "Commit", "Branches", "GitHub / GitLab", "Pull Request"],
  briefing:
    "ENTROPIA has corrupted the central code repository. Luckily, Git keeps the history of every change. Learn how to use it to take back control.",
  lessons: [
    {
      title: "Why Git?",
      summary:
        "Git records every version of a project. You can go back in time, see who changed what, and work with others without overwriting each other. In DevOps, everything is in Git: code, configuration, infrastructure.",
      analogy: "Git is a time machine for your project, with a logbook of every change.",
      keyPoint: "Git keeps the history of versions and lets several people work together.",
    },
    {
      title: "The commit: a snapshot of the project",
      summary:
        "A commit is a save of the project's state, with a message attached. You first choose which files to include with `git add`, then save with `git commit -m \"message\"`.",
      analogy: "`git add` puts the objects in front of the camera, `git commit` presses the shutter and writes a caption.",
      example: { code: 'git commit -m "add login"', meaning: "Saves a new version with this message." },
      keyPoint: "`git add` prepares the files, `git commit -m \"...\"` saves a version.",
    },
    {
      title: "Branches",
      summary:
        "A branch is a parallel copy of the project where you work without touching the main version (`main`). Once your work is ready, you merge it into `main`. `git switch -c name` creates a branch and moves you onto it.",
      analogy: "It is a rough draft: you try things on the side, and only copy it over neatly once it is good.",
      example: { code: "git switch -c login", meaning: "Creates the login branch and switches to it." },
      keyPoint: "A branch lets you work separately; `git switch -c name` creates one.",
    },
    {
      title: "GitHub and GitLab",
      summary:
        "GitHub and GitLab host Git repositories online so you can share code. `git push` sends your commits to the server, `git pull` fetches your teammates' commits.",
      analogy: "It is a Google Drive for code, but with the full history of versions.",
      keyPoint: "`git push` sends, `git pull` fetches; GitHub/GitLab host the repositories.",
    },
    {
      title: "The Pull Request",
      summary:
        "Before merging a branch into `main`, you open a Pull Request (or Merge Request): teammates review it, comment, and automated tests run. Golden rule: never put a password in Git.",
      analogy: "It is like asking a coworker to proofread an important letter before you send it.",
      keyPoint: "A Pull Request gets a branch reviewed and tested before it is merged.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is Git for?",
      options: ["Hosting a website", "Keeping the history of code versions and collaborating", "Compiling code", "Protecting a network"],
      correctIndex: 1,
      explanation: "Git is a version control system: it keeps every version and makes teamwork easier.",
    },
    {
      kind: "command",
      prompt: "Your files are already added with git add. Save a version with the message add login.",
      acceptedAnswers: ['git commit -m "add login"'],
      hint: 'git commit -m "your message"',
      explanation: '`git commit -m "add login"` creates a new version with this message in the history.',
    },
    {
      kind: "command",
      prompt: "Create a branch called feature and switch to it.",
      acceptedAnswers: ["git switch -c feature", "git checkout -b feature"],
      hint: "git switch -c followed by the name.",
      explanation: "`git switch -c feature` (or the older form `git checkout -b feature`) creates the branch and moves you onto it.",
    },
    {
      kind: "order",
      prompt: "Put the steps in order to publish a change.",
      steps: ["git pull (fetch your teammates' work)", "Edit the files", "git add", 'git commit -m "message"', "git push"],
      explanation: "First you fetch what is new, then you edit, prepare (add), save (commit), and finally send (push).",
    },
    {
      kind: "choice",
      prompt: "What is a Pull Request?",
      options: [
        "A command to download Git",
        "A request for a review before merging your changes",
        "A type of server",
        "An automatic backup",
      ],
      correctIndex: 1,
      explanation: "The Pull Request lets teammates review the work and runs the tests before the merge into main.",
    },
  ],
};
