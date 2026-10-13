import type { DevOpsModule } from "../../types";

export const shellModuleEn: DevOpsModule = {
  id: "shell",
  codename: "Operation SHELL",
  title: "Terminal Basics",
  roadmapSection: "Terminal Knowledge",
  roadmapTopics: ["Moving around (cd, pwd)", "Reading a file", "grep", "Permissions", "Bash scripts"],
  briefing:
    "The consoles in sector B have no graphical interface: only a terminal. Learn to move around, read the logs and run your own scripts.",
  lessons: [
    {
      title: "Moving between folders",
      summary:
        "`pwd` displays the folder you are in. `cd folder-name` enters a folder, and `cd ..` goes up one level (the two dots mean the parent folder).",
      analogy: "It is like getting around a building: `pwd` tells you which floor you are on, `cd` takes the stairs, `..` goes down one floor.",
      example: { code: "cd ..", meaning: "Goes up to the parent folder." },
      keyPoint: "`pwd` = where am I; `cd folder` = go in; `cd ..` = go up.",
    },
    {
      title: "Reading a file",
      summary:
        "`cat file` displays the whole content of a file. For logs that keep growing, `tail -f file` shows the last lines and keeps showing new ones live.",
      analogy: "`cat` reads the whole book; `tail -f` is watching someone write live over their shoulder.",
      example: { code: "tail -f /var/log/syslog", meaning: "Follows the system log live." },
      keyPoint: "`cat` displays a file; `tail -f` follows a log in real time.",
    },
    {
      title: "Searching with grep",
      summary:
        "`grep WORD file` only displays the lines that contain WORD. Essential for finding an error in a log with thousands of lines.",
      analogy: "It is the Ctrl+F of the terminal.",
      example: { code: "grep ERROR app.log", meaning: "Displays only the lines containing ERROR in app.log." },
      keyPoint: "`grep WORD file` filters the lines containing a word.",
    },
    {
      title: "Permissions",
      summary:
        "Every file has rights: read (r), write (w) and execute (x). A script must have the execute right to be run. `chmod +x file` adds that right.",
      analogy: "They are access badges: some people can only look, others can edit, others can operate the machine.",
      example: { code: "chmod +x deploy.sh", meaning: "Makes the deploy.sh script executable." },
      keyPoint: "Rights r/w/x; `chmod +x file` makes a script executable.",
    },
    {
      title: "Bash scripts",
      summary:
        "A Bash script is a text file that contains commands, run one after another. It starts with `#!/bin/bash`. Once it is executable, you run it with `./script-name.sh`.",
      analogy: "It is a written recipe: instead of dictating each step, you hand over the card and it is followed to the letter.",
      example: { code: "./deploy.sh", meaning: "Runs the deploy.sh script located in the current folder." },
      keyPoint: "A Bash script chains commands; you run it with ./script.sh.",
    },
  ],
  challenges: [
    {
      kind: "command",
      prompt: "You are in /var/log/nginx. Go up to the parent folder.",
      acceptedAnswers: ["cd .."],
      hint: "cd followed by two dots.",
      explanation: "`cd ..` goes up one level: you move from /var/log/nginx to /var/log.",
    },
    {
      kind: "choice",
      prompt: "You want to watch new lines being added to a log live. Which command?",
      options: ["cat app.log", "tail -f app.log", "ls app.log", "cd app.log"],
      correctIndex: 1,
      explanation: "`tail -f` (f for follow) displays new lines as they arrive.",
    },
    {
      kind: "command",
      prompt: "Display only the lines containing ERROR in the app.log file.",
      acceptedAnswers: ["grep ERROR app.log", 'grep "ERROR" app.log'],
      hint: "grep WORD file",
      explanation: "`grep ERROR app.log` filters the file and keeps only the lines with ERROR.",
    },
    {
      kind: "command",
      prompt: "The deploy.sh script refuses to run (\"Permission denied\"). Make it executable.",
      acceptedAnswers: ["chmod +x deploy.sh", "chmod u+x deploy.sh", "chmod 755 deploy.sh", "chmod 700 deploy.sh"],
      hint: "chmod +x followed by the file name.",
      explanation: "\"Permission denied\" means the execute right is missing. `chmod +x` adds it.",
    },
    {
      kind: "order",
      prompt: "Put the steps in order to create and run your first script.",
      steps: [
        "Create the deploy.sh file",
        "Write the commands inside (starting with #!/bin/bash)",
        "Make it executable with chmod +x deploy.sh",
        "Run it with ./deploy.sh",
      ],
      explanation: "Create → fill in → allow execution → run. Without the chmod step, running it fails.",
    },
  ],
};
