import type { DevOpsModule } from "../../types";

export const containerModuleEn: DevOpsModule = {
  id: "container",
  codename: "Operation CONTAINER",
  title: "Containers with Docker",
  roadmapSection: "Containers",
  roadmapTopics: ["Container", "Image", "Dockerfile", "docker ps / stop", "Ports"],
  briefing:
    "The sentinels in this sector run in Docker containers. New gadget: you can stop them with `docker stop` followed by their name (Q key).",
  lessons: [
    {
      title: "The \"it works on my machine\" problem",
      summary:
        "An application needs a lot of things to work: a specific version of a language, libraries, settings. A container packs the application WITH all of that, so it runs the same everywhere.",
      analogy: "It is a shipping container: no matter the ship or the truck, what is inside arrives intact.",
      keyPoint: "A container packs an application with everything it needs.",
    },
    {
      title: "Image and container",
      summary:
        "An image is the frozen template (the application + its dependencies). A container is an image that is running. You can start several containers from the same image.",
      analogy: "The image is the cake mold, the container is the cake. One mold, as many cakes as you want.",
      example: { code: "docker run nginx", meaning: "Starts a container from the nginx image." },
      keyPoint: "Image = template; container = a running image.",
    },
    {
      title: "List and stop (your new gadget)",
      summary:
        "`docker ps` lists the running containers, with their names. `docker stop name` cleanly stops a container. This is exactly what you will use against the sentinels!",
      analogy: "`docker ps` is the list of machines switched on in the workshop; `docker stop` is the power switch.",
      example: { code: "docker stop web", meaning: "Stops the container named web." },
      keyPoint: "`docker ps` lists containers; `docker stop <name>` stops one.",
    },
    {
      title: "Ports and data",
      summary:
        "A container is isolated: to reach it, you connect a port on your machine to a port in the container with `-p 8080:80`. And its files disappear when you delete it, unless you use a volume.",
      analogy: "`-p` cuts a window in the box; the volume is an outside locker where you keep what you want to save.",
      example: { code: "docker run -d -p 8080:80 nginx", meaning: "Starts nginx in the background, reachable on port 8080." },
      keyPoint: "`-p host:container` opens a port; a volume keeps the data.",
    },
    {
      title: "The Dockerfile",
      summary:
        "The Dockerfile is the recipe for an image: you start from a base (`FROM`), copy the code (`COPY`), install things (`RUN`) and give the startup command (`CMD`). `docker build` makes the image.",
      analogy: "It is the recipe card any cook can follow to get exactly the same dish.",
      example: { code: "docker build -t myapp .", meaning: "Builds an image named myapp from the Dockerfile in the current folder." },
      keyPoint: "The Dockerfile describes the image; `docker build` builds it.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is a container?",
      options: [
        "A physical computer",
        "An isolated box that holds an application and everything it needs",
        "A backup folder",
        "A network cable",
      ],
      correctIndex: 1,
      explanation: "The container guarantees that the application runs the same way on your PC, in testing and in production.",
    },
    {
      kind: "choice",
      prompt: "What is the difference between an image and a container?",
      options: [
        "None",
        "The image is the template, the container is the image running",
        "The container is older than the image",
        "The image only works on Windows",
      ],
      correctIndex: 1,
      explanation: "The mold (image) and the cake (container): you start as many containers as you want from one image.",
    },
    {
      kind: "command",
      prompt: "List the running containers.",
      acceptedAnswers: ["docker ps", "docker container ls", "docker container ps"],
      hint: "docker followed by two letters (like the Linux command for processes).",
      explanation: "`docker ps` shows the active containers with their name, image and ports.",
    },
    {
      kind: "command",
      prompt: "Start the nginx image in the background, reachable on port 8080 of the machine (the container listens on port 80).",
      acceptedAnswers: [
        "docker run -d -p 8080:80 nginx",
        "docker run -p 8080:80 -d nginx",
        "docker run -p 8080:80 nginx",
        "docker run --detach -p 8080:80 nginx",
        "docker run -d --publish 8080:80 nginx",
      ],
      hint: "Reread the \"Ports and data\" file: docker run -d -p HOST:CONTAINER image",
      explanation: "`-p 8080:80` connects port 8080 of the machine to port 80 of the container; `-d` runs it in the background.",
    },
    {
      kind: "order",
      prompt: "Put the steps in order to run your application in Docker.",
      steps: ["Write the Dockerfile", "Build the image (docker build)", "Start a container (docker run)", "Check that it is running (docker ps)"],
      explanation: "Recipe → image → container → check.",
    },
  ],
};
