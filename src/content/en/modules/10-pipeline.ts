import type { DevOpsModule } from "../../types";

export const pipelineModuleEn: DevOpsModule = {
  id: "pipeline",
  codename: "Operation PIPELINE",
  title: "CI/CD: delivering automatically",
  roadmapSection: "CI / CD Tools · Artifact Management",
  roadmapTopics: ["Continuous integration", "Continuous deployment", "Pipeline", "GitHub Actions", "Artifacts"],
  briefing:
    "Helix Corp's delivery chain has been sabotaged: code that was never tested is going straight to production. Rebuild a reliable, automatic chain.",
  lessons: [
    {
      title: "Continuous integration (CI)",
      summary:
        "Every time a developer sends code (a push), a robot picks it up, builds it, and runs the tests automatically. A mistake is caught within minutes instead of weeks.",
      analogy: "It is an automatic quality check at the end of every station in the factory.",
      keyPoint: "CI: every change is built and tested automatically.",
    },
    {
      title: "Continuous deployment (CD)",
      summary:
        "If the tests pass, the new version is put online automatically (or with one click). If a test fails, nothing is deployed: you fix it first.",
      analogy: "The package only goes out to the customer if it has passed the quality check.",
      keyPoint: "CD: if everything is green, the version is deployed automatically; otherwise, nothing ships.",
    },
    {
      title: "The pipeline",
      summary:
        "The pipeline is the series of automatic steps: get the code, build, test, deploy to a test environment (staging), then to production.",
      analogy: "It is an assembly line: each station does its job and passes the work to the next.",
      keyPoint: "Pipeline: build → tests → staging → production.",
    },
    {
      title: "GitHub Actions",
      summary:
        "GitHub Actions is the CI/CD tool built into GitHub. You describe the pipeline in a YAML file stored in `.github/workflows/`. By the way, this very game is tested and deployed with GitHub Actions!",
      analogy: "It is the assembly line's rulebook, kept in the same binder as the code.",
      keyPoint: "GitHub Actions: pipelines described in YAML in .github/workflows/.",
    },
    {
      title: "Artifacts",
      summary:
        "An artifact is the result of the build: a Docker image, an executable file... You build it only once, store it, then deploy the exact same one to test and to production.",
      analogy: "You print a single edition of a book, and that same book goes to the proofreaders and then to the readers.",
      keyPoint: "Build the artifact once, deploy it everywhere.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What does continuous integration (CI) do?",
      options: ["It writes the code for you", "It automatically builds and tests every change", "It backs up your emails", "It replaces Git"],
      correctIndex: 1,
      explanation: "CI catches errors early, on every push.",
    },
    {
      kind: "choice",
      prompt: "The tests fail in the pipeline. What happens?",
      options: ["We deploy anyway", "The deployment is blocked, and we fix it first", "We delete the tests", "The server restarts"],
      correctIndex: 1,
      explanation: "That is the whole point: code that breaks the tests never reaches the users.",
    },
    {
      kind: "order",
      prompt: "Put the steps of a pipeline in order.",
      steps: ["Push the code", "Build", "Automated tests", "Deploy to test (staging)", "Deploy to production"],
      explanation: "We check as early as possible, and production comes last, after all the checks.",
    },
    {
      kind: "choice",
      prompt: "Where do you store GitHub Actions pipeline files?",
      options: ["In the .github/workflows/ folder", "In /etc/nginx", "In the Dockerfile", "In an email"],
      correctIndex: 0,
      explanation: "Each YAML file in .github/workflows/ describes one pipeline.",
    },
    {
      kind: "choice",
      prompt: "Why build the artifact only once?",
      options: [
        "Only to save electricity",
        "To deploy exactly the same tested version to staging and then to production",
        "Because rebuilding is forbidden",
        "To go more slowly",
      ],
      correctIndex: 1,
      explanation: "What goes to production is exactly what was tested: no surprises.",
    },
  ],
};
