import type { DevOpsModule } from "../../types";

export const kernelModuleEn: DevOpsModule = {
  id: "kernel",
  codename: "Operation KERNEL",
  title: "Linux, the Server System",
  roadmapSection: "Learn a Programming Language · Operating System",
  roadmapTopics: ["Operating system", "Linux", "Ubuntu / Debian", "File tree", "Packages", "Processes"],
  briefing:
    "ENTROPIA has taken over the basement of Helix Corp, where the servers run. Almost all of them run Linux: learn to find your way around. New gadget: you can now stop a sentinel from a distance with the `kill` command (Q key).",
  lessons: [
    {
      title: "The operating system",
      summary:
        "The operating system (OS) is the base software of a computer: it manages memory and files, and launches programs. Windows and macOS are operating systems. On servers, Linux dominates: it is free, stable and open source (its code is public).",
      analogy: "The OS is the conductor of the computer: it hands out work between the musicians (programs) and the instruments (processor, memory, disk).",
      keyPoint: "The vast majority of servers run Linux.",
    },
    {
      title: "Linux distributions",
      summary:
        "Linux comes in several \"distributions\": Ubuntu, Debian, Fedora, Red Hat... They share the same core but differ in the tools they ship with. Ubuntu is the most popular for beginners.",
      analogy: "They are different recipes for the same dish: the base is identical, the seasoning changes.",
      keyPoint: "Ubuntu, Debian or Red Hat are Linux distributions: same core, different tools.",
    },
    {
      title: "Files and folders",
      summary:
        "On Linux, everything starts from a root folder written `/`. A few key folders: `/home` (users' folders), `/etc` (configuration files), `/var/log` (logs). The `ls` command lists the contents of the folder you are in.",
      analogy: "It is a big cabinet (/) with drawers sorted by theme: personal belongings in /home, settings in /etc.",
      example: { code: "ls", meaning: "Lists the files and folders in the current folder." },
      keyPoint: "`ls` lists files; configuration lives in /etc and logs in /var/log.",
    },
    {
      title: "Installing software",
      summary:
        "On Ubuntu, you install software with the `apt` package manager. Since installing changes the system, you put `sudo` in front of the command, which temporarily gives you administrator rights.",
      analogy: "`apt` is the server's App Store, and `sudo` is the guard's badge that lets you into the machine room.",
      example: { code: "sudo apt install nginx", meaning: "Downloads and installs the nginx software (a web server)." },
      keyPoint: "`sudo apt install <software>` installs software on Ubuntu/Debian.",
    },
    {
      title: "Processes (and your new gadget)",
      summary:
        "A process is a program that is running. Each one gets a unique number: the PID. The `ps` command lists processes, and `kill` followed by the PID stops a process. ENTROPIA's sentinels are processes: find their PID and stop them!",
      analogy: "Every worker in a factory wears a badge number (the PID). To send someone home, you call out their number.",
      example: { code: "kill 4242", meaning: "Asks process number 4242 to stop." },
      keyPoint: "A process has a number (PID); `ps` lists them and `kill <PID>` stops one.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "Which operating system runs most of the world's servers?",
      options: ["Windows", "Linux", "macOS", "Android"],
      correctIndex: 1,
      explanation: "Linux dominates on servers and in the cloud: it is free, stable, secure and very well equipped with tools.",
    },
    {
      kind: "choice",
      prompt: "Ubuntu is...",
      options: ["A programming language", "A Linux distribution", "A web browser", "A database"],
      correctIndex: 1,
      explanation: "Ubuntu is a Linux distribution, very popular for beginners and on servers.",
    },
    {
      kind: "command",
      prompt: "You have just arrived on the server. Type the command that lists the files in the current folder.",
      acceptedAnswers: ["ls", "ls -l", "ls -la", "ls -a", "ls -al", "ls -lh"],
      hint: "Just two letters, for \"list\".",
      explanation: "`ls` lists the contents of the folder. With `-l` you get details (size, date), with `-a` the hidden files.",
    },
    {
      kind: "command",
      prompt: "Install the nginx web server on this Ubuntu server.",
      acceptedAnswers: ["apt install nginx", "apt-get install nginx", "apt install -y nginx", "apt-get install -y nginx"],
      hint: "sudo apt install ... followed by the name of the software.",
      explanation: "`sudo apt install nginx` installs nginx. The `sudo` is needed because installing changes the system.",
    },
    {
      kind: "choice",
      prompt: "What is the unique number given to each process called?",
      options: ["The IP", "The PID", "The port", "The DNS"],
      correctIndex: 1,
      explanation: "PID = Process ID. This is the number you give to `kill` to stop a specific process.",
    },
  ],
};
