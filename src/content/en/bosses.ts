import type { BossDefinition } from "../types";

/**
 * One boss per module. Each boss is fought only with commands seen in that module (lessons, challenges,
 * intervention or gadget): it is a practical exam, not a discovery.
 * The 3 phases tell a full incident (diagnosis, action, final blow) and every goal forces you to read the
 * displayed output: a PID, a container or pod name, an IP, a file...
 * Patterns apply to the normalized command (without "sudo", quotes unified as ").
 */
export const BOSSES_EN: Record<string, BossDefinition> = {
  genesis: {
    moduleId: "genesis",
    name: "The Black Screen",
    title: "The terminal that scares you",
    intro:
      "The Black Screen is the fear of the terminal: a black window with no buttons that seems to understand nothing. It fades as soon as you dare to talk to it with simple commands.",
    color: 0x6c7bff,
    phases: [
      {
        context: ["████████ BLACK SCREEN ████████", "> Incoming connection detected.", "> No badge, no name.", "> WHO ARE YOU?"],
        goal: "The Black Screen demands your identity. Make the server display the username you are logged in with.",
        hint: "The command is the English for \"who am I\", all stuck together: `whoami`.",
        accepted: ["whoami"],
        output: ["spectre"],
      },
      {
        context: ["> spectre... That name means nothing to me.", "> My clock stopped on January 1, 1970.", "> PROVE TO ME THAT TIME STILL PASSES."],
        goal: "Its clock is stuck in 1970. Show it the server's current date and time.",
        hint: "The command is simply... `date`. One command, nothing after it.",
        accepted: ["date"],
        output: ["Mon Oct 12 23:47:12 UTC 2026"],
      },
      {
        context: [
          "> 2026?! I slept for too long...",
          "> Last trial: only a human can write the code word.",
          "> Code word: LIGHT",
          "> Make it appear on screen, in capital letters.",
        ],
        goal: "Display the code word (read it in the output) with the command that repeats the text you give it.",
        hint: "`echo` prints the text you give it: type echo, a space, then the code word in capital letters.",
        accepted: ["echo LIGHT", 'echo "LIGHT"'],
        patterns: ['echo "?LIGHT"?'],
        output: ["LIGHT", "> ...the light is coming back. The Black Screen fades away."],
      },
    ],
    defeat: "The terminal is not an enemy: you talk to it with precise words. `whoami` says who you are, `date` gives the time, `echo` prints a text.",
  },

  kernel: {
    moduleId: "kernel",
    name: "Zombie Process",
    title: "The process that refuses to die",
    intro:
      "On Linux, every running program is a process, with its own number: the PID. This boss is a parent process that ignores stop orders and leaves \"zombies\" behind: processes that are already dead but still listed.",
    color: 0x7dff4a,
    phases: [
      {
        context: [
          "ALERT  the machine is crawling: load average 12.40, 11.87, 9.02",
          "ALERT  the process list is overflowing",
          "# Something is multiplying in the system. You need to see ALL the processes.",
        ],
        goal: "List all the processes on the machine, from every user, with the `ps` tool (like your kill gadget).",
        hint: "`ps` alone only shows the processes of your own terminal. Add the letters `aux`: a = all users, u = details, x = even those without a terminal.",
        accepted: ["ps aux", "ps -aux", "ps ax", "ps auxf", "ps -ef", "ps -eF", "ps -e", "ps -A"],
        output: [
          "USER       PID %CPU STAT COMMAND",
          "root         1  0.0 Ss   /sbin/init",
          "root       812  0.0 Ss   /usr/sbin/sshd -D",
          "entropia  6666 97.3 S    zombie-lord --spawn",
          "entropia  6671  0.0 Z    [worker] <defunct>",
          "entropia  6672  0.0 Z    [worker] <defunct>",
          "entropia  6673  0.0 Z    [worker] <defunct>",
        ],
      },
      {
        context: [
          "USER       PID %CPU STAT COMMAND",
          "root         1  0.0 Ss   /sbin/init",
          "root       812  0.0 Ss   /usr/sbin/sshd -D",
          "entropia  6666 97.3 S    zombie-lord --spawn",
          "entropia  6671  0.0 Z    [worker] <defunct>",
          "entropia  6672  0.0 Z    [worker] <defunct>",
          "# STAT Z = zombie: already dead, you can't kill it anymore.",
          "# Its parent, though, is very much alive... and keeps making more.",
        ],
        goal: "There is no point aiming at the zombies (state Z): they are already dead. End their parent, zombie-lord, with `kill` and its PID.",
        hint: "On the zombie-lord line, the PID is the number in the 2nd column. Type kill, a space, then that number.",
        accepted: ["kill 6666", "kill -15 6666", "kill -TERM 6666", "kill -SIGTERM 6666", "kill -9 6666", "kill -KILL 6666", "kill -SIGKILL 6666"],
        output: [],
      },
      {
        context: [
          "$ ps aux | grep zombie",
          "entropia  7013 98.1 S    zombie-lord --backup --trap SIGTERM",
          "# The zombies are gone: once their parent died, the system cleaned them up.",
          "# But a backup copy has started, and it intercepts the polite stop (SIGTERM).",
        ],
        goal: "The backup copy has a new PID and ignores the polite stop. Send it signal 9 (SIGKILL), the only one no process can intercept: you pick it with the `-9` option of kill.",
        hint: "kill, then the -9 option, then the PID. Use the NEW PID, on the --backup line.",
        accepted: ["kill -9 7013", "kill -KILL 7013", "kill -SIGKILL 7013", "kill -s KILL 7013", "kill -s 9 7013", "kill -s SIGKILL 7013"],
        output: [],
      },
    ],
    defeat:
      "`ps aux` lists every process, `kill PID` politely asks it to stop, `kill -9 PID` forces it. A zombie (state Z) is already dead: you aim at its parent.",
  },

  shell: {
    moduleId: "shell",
    name: "Fork Bomb",
    title: "The script that clones itself forever",
    intro:
      "A fork bomb is a script that keeps copying itself until it chokes the machine. To defuse it, you trace the logs back to the original script, then take away its right to run.",
    color: 0xff7a1a,
    phases: [
      {
        context: [
          "ALERT  31,337 copies of bomb.sh in 10 seconds",
          "$ pwd",
          "/var/log",
          "$ tail -3 forkbomb.log",
          "03:14:07 CLONE #31335",
          "03:14:07 CLONE #31336",
          "03:14:07 CLONE #31337",
          "# Thousands of CLONE lines... and a single START line, which says where it all began.",
        ],
        goal: "Find the START line lost in forkbomb.log: show only the lines that contain that word, with `grep`.",
        hint: "grep WORD file: first the word you are looking for, then the file name (you are already in /var/log).",
        accepted: ["grep START forkbomb.log", 'grep "START" forkbomb.log', "grep START /var/log/forkbomb.log"],
        patterns: ['grep (-n )?"?START"? (/var/log/)?forkbomb\\.log'],
        output: ["03:00:00 START bomb.sh launched from /opt/entropia/bomb.sh"],
      },
      {
        context: [
          "03:00:00 START bomb.sh launched from /opt/entropia/bomb.sh",
          "$ ls -l /opt/entropia/bomb.sh",
          "-rwxr-xr-x 1 entropia entropia 42 Oct 12 03:00 /opt/entropia/bomb.sh",
          "# Every clone relaunches this file. The x's in -rwxr-xr-x: everyone is allowed to run it.",
        ],
        goal: "Defuse the bomb: remove the script's execute permission with `chmod`. You know `+x`, which adds that permission; the minus sign does the opposite: `-x` removes it. Without it, no clone can relaunch the script.",
        hint: "chmod -x, then the full path of the script, as it appears in the output (it starts with /opt).",
        accepted: [
          "chmod -x /opt/entropia/bomb.sh",
          "chmod a-x /opt/entropia/bomb.sh",
          "chmod ugo-x /opt/entropia/bomb.sh",
          "chmod 644 /opt/entropia/bomb.sh",
          "chmod 640 /opt/entropia/bomb.sh",
          "chmod 600 /opt/entropia/bomb.sh",
          "chmod 444 /opt/entropia/bomb.sh",
          "chmod 400 /opt/entropia/bomb.sh",
        ],
        output: [],
      },
      {
        context: [
          "$ tail -2 forkbomb.log",
          "03:14:09 CLONE #31337",
          "03:14:09 ERROR /opt/entropia/bomb.sh: Permission denied",
          "# Before you stepped in, there were 31337 CLONE lines.",
        ],
        goal: "Check that the bomb is dead: count the lines of forkbomb.log that contain CLONE. If the total hasn't moved, no new clone is being born.",
        hint: "The -c option of grep (c for count) prints a number instead of the lines: grep -c WORD file.",
        accepted: ["grep -c CLONE forkbomb.log", 'grep -c "CLONE" forkbomb.log', "grep -c CLONE /var/log/forkbomb.log"],
        patterns: ['grep -c "?CLONE"? (/var/log/)?forkbomb\\.log'],
        output: ["31337"],
      },
    ],
    defeat: "`grep` finds one line in an ocean of logs, `grep -c` counts, and `chmod` sets permissions: `+x` allows execution, `-x` removes it.",
  },

  branch: {
    moduleId: "branch",
    name: "Merge Conflict",
    title: "Two versions, one file",
    intro:
      "When two people change the same line of a file, Git doesn't know which one to keep: that is a merge conflict. This boss feeds on panic; you beat it by reading what Git says, then saving the right version.",
    color: 0xf05133,
    phases: [
      {
        context: [
          "$ git pull",
          "Auto-merging deploy.yml",
          "CONFLICT (content): Merge conflict in deploy.yml",
          "Automatic merge failed; fix conflicts and then commit the result.",
        ],
        goal: "Don't panic: first ask Git for the state of the repository, to know which branch you are on and which files are in conflict.",
        hint: "git followed by the English word for \"state\": `status`.",
        accepted: ["git status"],
        output: ["On branch main", "You have unmerged paths.", "Unmerged paths:", "        both modified:   deploy.yml"],
      },
      {
        context: [
          "# You opened the conflicted file, kept replicas: 3 and deleted the <<<<<<< ======= >>>>>>> markers",
          "$ cat deploy.yml",
          "replicas: 3",
          "image: helix/api:2.4",
          "$ git status",
          "Unmerged paths:",
          "        both modified:   deploy.yml",
        ],
        goal: "The file is fixed by hand. Tell Git it is ready to go into the next version (the next commit).",
        hint: "It is `git add` followed by the name of the fixed file (read it in the output).",
        accepted: ["git add deploy.yml", "git add .", "git add -A", "git add --all"],
        output: [],
      },
      {
        context: [
          "$ git status",
          "On branch main",
          "All conflicts fixed but you are still merging.",
          "Changes to be committed:",
          "        modified:   deploy.yml",
        ],
        goal: "Final blow: finish the merge by saving a version, with a message in quotes that explains what you did.",
        hint: 'git commit -m followed by your message in quotes, for example "fix the conflict".',
        accepted: ['git commit -m "resolve deploy.yml conflict"'],
        patterns: ['git commit -m ".+"'],
        output: ["[main 7c3d2e1] resolve deploy.yml conflict"],
      },
    ],
    defeat:
      "Facing a conflict: `git status` to look, fix the file by hand, `git add` to mark it as resolved, `git commit -m` to finish the merge.",
  },

  packet: {
    moduleId: "packet",
    name: "DDoS",
    title: "The packet tide",
    intro:
      "A DDoS attack is thousands of hacked machines flooding a server with requests until it stops answering anyone. To take back control, you check each layer of the network, then log in to the server to turn on its defenses.",
    color: 0x2ec4ff,
    phases: [
      {
        context: [
          "ALERT  incoming traffic: 2,400,000 requests/s (normal: 300)",
          "ALERT  target: helix.local",
          "ALERT  sources: 40,000 different IP addresses",
        ],
        goal: "Is the targeted server (its name is in the alert) still answering? Send it 3 test packets with `ping`.",
        hint: "ping -c 3 followed by the machine name: -c (count) sets the number of packets.",
        accepted: ["ping -c 3 helix.local", "ping helix.local"],
        patterns: ["ping -c \\d+ helix\\.local"],
        output: [
          "PING helix.local (10.0.0.5) 56(84) bytes of data.",
          "64 bytes from 10.0.0.5: icmp_seq=1 ttl=64 time=812 ms",
          "--- helix.local ping statistics ---",
          "3 packets transmitted, 1 received, 66.6667% packet loss, time 2031ms",
        ],
      },
      {
        context: [
          "3 packets transmitted, 1 received, 66.6667% packet loss, time 2031ms",
          "# The machine barely answers: 2 packets out of 3 are lost.",
          "# And the website http://helix.local, what does it tell visitors?",
        ],
        goal: "Query the website (address in the output) with `curl`, asking only for the HTTP headers, to read its response code.",
        hint: "The -I option of curl (capital i) only asks for the headers: curl -I followed by the full address.",
        accepted: ["curl -I http://helix.local", "curl -I helix.local", "curl --head http://helix.local", "curl --head helix.local"],
        output: ["HTTP/1.1 503 Service Unavailable", "Server: nginx/1.24.0", "Retry-After: 120"],
      },
      {
        context: [
          "HTTP/1.1 503 Service Unavailable",
          "# 503: the server is overwhelmed. You have to act from the server itself.",
          "# Emergency sheet  ->  address: 10.0.0.5   account: deploy",
          "# The anti-DDoS shield turns on when the deploy account logs in.",
        ],
        goal: "Open a secure terminal on the server, using the address and account from the emergency sheet, to turn on the shield.",
        hint: "`ssh user@address`: the account, then @, then the IP address, with no spaces.",
        accepted: ["ssh deploy@10.0.0.5", "ssh -l deploy 10.0.0.5"],
        output: ["Welcome to Ubuntu 24.04.1 LTS", "[shield] Emergency filtering on: 39,998 zombie addresses blocked.", "deploy@helix:~$"],
      },
    ],
    defeat:
      "Facing a network outage, you go down layer by layer: `ping` (does the machine answer?), `curl -I` (does the site answer?), then `ssh` to work on the server itself.",
  },

  gateway: {
    moduleId: "gateway",
    name: "502 Bad Gateway",
    title: "The gateway that leads nowhere",
    intro:
      "A 502 error means the reverse proxy (nginx) is running, but can no longer reach the application behind it. This boss plugged the gateway into a port where nothing is listening, booby-trapped its configuration to block the repair, and is hammering it from a single address.",
    color: 0xff3355,
    phases: [
      {
        // An nginx that answers 502 is necessarily running a valid configuration: the typo does not cause
        // the 502, it only prevents the fix from being reloaded (nginx refuses and keeps the old one).
        context: [
          "$ curl -I https://helix.local",
          "HTTP/2 502",
          "server: nginx/1.24.0",
          "# ENTROPIA pointed nginx at port 9999, where the application isn't listening: hence the 502.",
          "# You put the right port back in the configuration... but the reload fails:",
          "Job for nginx.service failed because the control process exited with error code.",
        ],
        goal: "nginx refuses your new configuration. Before trying again, have it check that the configuration is valid, without applying it, to find out what is wrong.",
        hint: "nginx followed by the -t option (t for test).",
        accepted: ["nginx -t"],
        output: [
          'nginx: [emerg] unknown directive "proxy_passs" in /etc/nginx/sites-enabled/helix:14',
          "nginx: configuration file /etc/nginx/nginx.conf test failed",
        ],
      },
      {
        context: [
          'nginx: [emerg] unknown directive "proxy_passs" in /etc/nginx/sites-enabled/helix:14',
          "# ENTROPIA's trap: a typo. As long as it is there, nginx refuses any new",
          "# configuration and keeps the old one, the one with the dead port. You fixed it on line 14.",
          "$ sudo nginx -t",
          "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
          "nginx: configuration file /etc/nginx/nginx.conf test is successful",
        ],
        goal: "The configuration is valid. Apply it with `systemctl` without cutting off the visitors who are already connected: you reload, you don't restart.",
        hint: "sudo systemctl reload followed by the service name, nginx. \"reload\" rereads the configuration without cutting connections.",
        accepted: ["systemctl reload nginx", "systemctl reload nginx.service", "nginx -s reload"],
        output: [],
      },
      {
        context: [
          "# Reloaded: the 502 is gone, nginx reaches the application again. But its log is going wild:",
          "$ sudo tail -4 /var/log/nginx/access.log",
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          '198.51.100.7 - - "GET / HTTP/1.1" 200',
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          "# A single address is hammering /admin thousands of times per second.",
        ],
        goal: "One IP address is bombarding the gateway (read the log). Block everything coming from it in the `ufw` firewall, like your gadget against the cameras.",
        hint: "sudo ufw deny from followed by the IP address that keeps coming back in the log.",
        accepted: ["ufw deny from 203.0.113.66", "ufw deny from 203.0.113.66 to any", "ufw insert 1 deny from 203.0.113.66"],
        output: ["Rule added"],
      },
    ],
    defeat:
      "A 502 means nginx is running but can't reach the application. nginx refuses any invalid configuration and keeps the old one: you test (`nginx -t`) before reloading (`systemctl reload nginx`), then you close the firewall to the hostile address (`ufw deny from IP`).",
  },

  container: {
    moduleId: "container",
    name: "OOMKiller",
    title: "The container that devours memory",
    intro:
      "When memory is full, Linux triggers its \"OOM killer\", which shoots down programs to survive. This boss is a greedy container that causes these executions one after another, until it takes down the database.",
    color: 0x1d9bf0,
    phases: [
      {
        context: [
          "ALERT  host memory: 15.8 GB / 16 GB",
          "kernel: Out of memory: Killed process 2211 (postgres)",
          "kernel: Out of memory: Killed process 2240 (nginx)",
          "# One container keeps swelling. Which one?",
        ],
        goal: "List the running Docker containers to spot the intruder.",
        hint: "docker followed by two letters, like the Linux command that lists processes.",
        accepted: ["docker ps", "docker container ls", "docker container ps", "docker ps -a"],
        output: [
          "CONTAINER ID   IMAGE                    STATUS                           NAMES",
          "3f2a1c9e8b7d   nginx:1.27               Restarting (137) 4 seconds ago   web",
          "9b1e77aa0c42   postgres:16              Restarting (137) 9 seconds ago   db",
          "e1d0c0ffee42   entropia/hydra:latest    Up 6 minutes                     hydra",
        ],
      },
      {
        context: [
          "CONTAINER ID   IMAGE                    STATUS                           NAMES",
          "3f2a1c9e8b7d   nginx:1.27               Restarting (137) 4 seconds ago   web",
          "9b1e77aa0c42   postgres:16              Restarting (137) 9 seconds ago   db",
          "e1d0c0ffee42   entropia/hydra:latest    Up 6 minutes                     hydra",
          "# Code 137 = container killed for lack of memory. Only one is still standing...",
        ],
        goal: "One container never gets killed. Read its logs with Docker to understand what it is up to.",
        hint: "docker logs followed by the container name (NAMES column).",
        accepted: ["docker logs hydra", "docker container logs hydra", "docker logs e1d0c0ffee42"],
        output: [
          "[hydra] reserving 512 MB... OK",
          "[hydra] reserving 512 MB... OK",
          "[hydra] memory reserved: 15.2 GB - I never give anything back",
          "[hydra] next victim: db",
        ],
      },
      {
        context: [
          "[hydra] reserving 512 MB... OK",
          "[hydra] memory reserved: 15.2 GB - I never give anything back",
          "[hydra] next victim: db",
        ],
        goal: "No more doubt: stop this container by its name before it swallows the database.",
        hint: "docker stop followed by the container name, like your gadget against the sentinels.",
        accepted: [
          "docker stop hydra",
          "docker kill hydra",
          "docker container stop hydra",
          "docker container kill hydra",
          "docker rm -f hydra",
          "docker stop e1d0c0ffee42",
          "docker kill e1d0c0ffee42",
        ],
        output: ["hydra"],
      },
    ],
    defeat:
      "`docker ps` shows the state of the containers, `docker logs` tells what they are doing, `docker stop` stops the culprit. In production, you also set a memory limit on every container.",
  },

  nimbus: {
    moduleId: "nimbus",
    name: "Infinite Bill",
    title: "The cloud account that spends without counting",
    intro:
      "In the cloud, you pay for what you use: a forgotten resource or a stolen key can make the bill climb forever. This boss hides behind an access key that had far too many permissions.",
    color: 0xff9900,
    phases: [
      {
        context: [
          "AWS BUDGET ALERT  spent since midnight: $48,213.77 (monthly budget: $900)",
          "Top item: S3 (storage), +2 TB per minute",
        ],
        goal: "S3 storage is exploding. List all the account's buckets with the `aws` tool to find the intruder.",
        hint: "The aws tool, the s3 service, then ls to list, just like on Linux.",
        accepted: ["aws s3 ls"],
        output: ["2026-03-12 09:41:02 helix-backups", "2026-05-02 14:03:55 helix-website", "2026-10-12 00:00:07 infinite-bill-7731"],
      },
      {
        context: [
          "2026-03-12 09:41:02 helix-backups",
          "2026-05-02 14:03:55 helix-website",
          "2026-10-12 00:00:07 infinite-bill-7731",
          "# One bucket was created at exactly midnight, just when the bill went out of control.",
        ],
        goal: "List the contents of the bucket created at midnight (read its name) to see what is piling up in it.",
        hint: "The same command as for listing buckets, followed by the bucket address: s3:// then its name.",
        accepted: ["aws s3 ls s3://infinite-bill-7731/", "aws s3 ls s3://infinite-bill-7731"],
        output: [
          "2026-10-12 00:00:08 5497558138880 copy-00001.bin",
          "2026-10-12 00:00:09 5497558138880 copy-00002.bin",
          "...",
          "2026-10-12 23:58:41 5497558138880 copy-14102.bin",
        ],
      },
      {
        context: [
          "# 14,102 files of 5 TB: that is the infinite bill.",
          "# The AWS audit log is clear: this bucket was created from this very server (ci-01),",
          "# with its own access keys. But who do they belong to?",
        ],
        goal: "Unmask the key that was used: ask AWS which identity this server is logged in with.",
        hint: "The STS service answers the question \"who am I?\": aws sts followed by get-caller-identity.",
        accepted: ["aws sts get-caller-identity"],
        output: [
          "{",
          '    "UserId": "AIDA7731ENTROPIA",',
          '    "Account": "123456789012",',
          '    "Arn": "arn:aws:iam::123456789012:user/ci-deploy"',
          "}",
        ],
      },
    ],
    defeat:
      "The ci-deploy key was only meant for deploying, but it had every permission: ENTROPIA only had to steal it. Least privilege and an eye on the bill: `aws s3 ls` to look, `aws sts get-caller-identity` to know who is acting.",
  },

  blueprint: {
    moduleId: "blueprint",
    name: "State Drift",
    title: "When reality no longer matches the code",
    intro:
      "With Terraform, the code describes the infrastructure. This boss is born every time someone changes a server by hand in the console: reality drifts away from the code, and nobody knows.",
    color: 0x7b42bc,
    phases: [
      {
        context: [
          "$ git clone git@github.com:helix-corp/infra.git && cd infra",
          "$ ls -a",
          ".  ..  main.tf  variables.tf",
          "# Brand-new machine: no .terraform folder, no plugin downloaded.",
        ],
        goal: "You are taking over the infrastructure on a brand-new machine. Prepare the Terraform project (downloading the plugins) before any other command.",
        hint: "The very first command of a project: terraform followed by the short form of \"initialize\".",
        accepted: ["terraform init"],
        output: ["Initializing provider plugins...", "- Installing hashicorp/aws v5.70.0...", "Terraform has been successfully initialized!"],
      },
      {
        context: [
          "Terraform has been successfully initialized!",
          "ALERT  the sg-web cloud firewall now allows port 22 to the whole world",
          "# Yet nobody has touched main.tf...",
        ],
        goal: "Compare the code with reality: ask Terraform what it would change, without touching anything.",
        hint: "It is Terraform's safe preview: terraform followed by the English word for \"plan\".",
        accepted: ["terraform plan", "terraform plan -out=tfplan", "terraform plan -out tfplan"],
        output: [
          "aws_security_group.web: Refreshing state... [id=sg-0a1b2c3d]",
          '  ~ resource "aws_security_group" "web" {',
          '      - ingress { from_port = 22, cidr_blocks = ["0.0.0.0/0"] }   # added by hand',
          "    }",
          "Plan: 0 to add, 1 to change, 0 to destroy.",
        ],
      },
      {
        context: [
          '  ~ resource "aws_security_group" "web" {',
          '      - ingress { from_port = 22, cidr_blocks = ["0.0.0.0/0"] }   # added by hand',
          "    }",
          "Plan: 0 to add, 1 to change, 0 to destroy.",
        ],
        goal: "The plan removes the rule added by hand and destroys nothing. Apply it to bring reality back in line with the code.",
        hint: "After plan comes... terraform apply.",
        accepted: ["terraform apply", "terraform apply -auto-approve", "terraform apply tfplan"],
        output: [
          "aws_security_group.web: Modifying... [id=sg-0a1b2c3d]",
          "aws_security_group.web: Modifications complete after 2s",
          "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.",
        ],
      },
    ],
    defeat:
      "init, plan, apply. The plan reveals the drift (what was changed by hand), apply brings reality back in line with the code. Golden rule: every change goes through the code.",
  },

  puppeteer: {
    moduleId: "puppeteer",
    name: "Config Drift",
    title: "Three servers, three configurations",
    intro:
      "This boss changes the servers one by one, by hand, until none of them looks like the others. Ansible fights it with a playbook: a single description, applied identically everywhere.",
    color: 0xee0000,
    phases: [
      {
        context: ["$ cat inventory.ini", "[web]", "web1", "web2", "web3", "# ENTROPIA has secretly logged in to some of these servers."],
        goal: "Check that Ansible can reach every server in the inventory.ini inventory, with its ping module.",
        hint: "ansible all -i inventory -m ping: all = every server, -i = the inventory file, -m = the module.",
        accepted: ["ansible all -i inventory.ini -m ping", "ansible -i inventory.ini all -m ping", "ansible web -i inventory.ini -m ping", "ansible -i inventory.ini web -m ping"],
        output: ['web1 | SUCCESS => {"ping": "pong"}', 'web2 | SUCCESS => {"ping": "pong"}', 'web3 | SUCCESS => {"ping": "pong"}'],
      },
      {
        context: [
          'web1 | SUCCESS => {"ping": "pong"}',
          'web2 | SUCCESS => {"ping": "pong"}',
          'web3 | SUCCESS => {"ping": "pong"}',
          "# All 3 answer. But which ones were changed by hand?",
        ],
        goal: "Simulate the site.yml playbook on the inventory, in check mode: it shows what it would change, without modifying anything.",
        hint: "The usual command (ansible-playbook, -i inventory.ini, site.yml), followed by the --check option.",
        accepted: [
          "ansible-playbook -i inventory.ini site.yml --check",
          "ansible-playbook site.yml -i inventory.ini --check",
          "ansible-playbook -i inventory.ini site.yml --check --diff",
          "ansible-playbook --check -i inventory.ini site.yml",
        ],
        output: [
          "TASK [Configure nginx] ok: [web1] changed: [web2] changed: [web3]",
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
        ],
      },
      {
        context: [
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
          "# changed=1: these servers have drifted. changed=0: compliant.",
        ],
        goal: "Two servers have drifted. Run the playbook for real: each one will go back to the described state, and the compliant server won't be touched (idempotence).",
        hint: "Exactly the same command as the simulation, but without --check.",
        accepted: ["ansible-playbook -i inventory.ini site.yml", "ansible-playbook site.yml -i inventory.ini"],
        output: [
          "TASK [Configure nginx] ok: [web1] changed: [web2] changed: [web3]",
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
        ],
      },
    ],
    defeat:
      "Ansible brings every server back to the state described in the playbook. Thanks to idempotence, a server that is already compliant isn't touched: you can rerun it without fear, and `--check` lets you look before you act.",
  },

  pipeline: {
    moduleId: "pipeline",
    name: "Red Build",
    title: "The CI that refuses to go green",
    intro:
      "This boss blocks every release to production by keeping the CI red. You never work around it: you read the failure log, fix the problem, prove the tests pass, then save the fix.",
    color: 0xd73a49,
    phases: [
      {
        context: ["ALERT  deployment blocked for 3 h: the CI on the hotfix branch is red.", "# First you need to find the run that failed."],
        goal: "List the latest pipeline runs with GitHub's `gh` tool, to find the ID of the one that failed.",
        hint: "gh run list: run = one execution of the pipeline, list = to list.",
        accepted: ["gh run list"],
        output: [
          "STATUS  TITLE                  WORKFLOW  BRANCH   ID",
          "X       fix the discount       CI        hotfix   6602",
          "✓       add the cart           CI        main     6588",
        ],
      },
      {
        context: [
          "STATUS  TITLE                  WORKFLOW  BRANCH   ID",
          "X       fix the discount       CI        hotfix   6602",
          "✓       add the cart           CI        main     6588",
          "# X = failure. Take note of its ID (ID column).",
        ],
        goal: "Show only the failed logs of the red run (its ID is in the list).",
        hint: "gh run view, then the ID, then the --log-failed option (only the failed logs).",
        accepted: ["gh run view 6602 --log-failed"],
        patterns: ["gh run view --log-failed 6602"],
        output: ["test  ✕ cart: total with 10% discount", "test    Expected: 90   Received: -10", "test  Tests: 1 failed, 57 passed"],
      },
      {
        context: [
          "test    Expected: 90   Received: -10",
          "# ENTROPIA had flipped a sign in cart.js. You fixed it.",
          "$ npm test",
          "Tests: 58 passed, 58 total",
        ],
        goal: "Everything is green locally. Save the fix in a single command: all the modified files, with a message in quotes.",
        hint: "git commit with -a (all modified files) and -m (the message), stuck together as -am, then your message in quotes.",
        accepted: ['git commit -am "fix: discount sign"'],
        patterns: ['git commit -am ".+"', 'git commit -a -m ".+"', 'git commit -m ".+" -a'],
        output: ["[hotfix 9d3e5f1] fix: discount sign", " 1 file changed, 1 insertion(+), 1 deletion(-)"],
      },
    ],
    defeat:
      "Red CI: `gh run list` to find the failure, `gh run view ID --log-failed` to read the cause, fix it, prove it with `npm test`, then commit and push.",
  },

  vault: {
    moduleId: "vault",
    name: "Exposed Secret",
    title: "The password lying around in plain text",
    intro:
      "A secret written in the code ends up in Git, where it stays forever in the history. This boss feeds on passwords forgotten in plain text; you beat it by putting them in a vault like Vault.",
    color: 0xffd814,
    phases: [
      {
        context: ["ALERT  a bot found a password on GitHub: DB_PASSWORD=hx-pass-2026", "# Which file in the code is hiding it?"],
        goal: "Search for the name of this variable (DB_PASSWORD) in every file of the current folder and its subfolders, with `grep`.",
        hint: "The -r option of grep searches all subfolders: grep -r WORD . (the dot = the current folder).",
        accepted: ["grep -r DB_PASSWORD .", 'grep -r "DB_PASSWORD" .', "grep -rn DB_PASSWORD .", "grep -r hx-pass-2026 ."],
        patterns: ['grep -(r|R|rn|nr|Rn|nR) "?(DB_PASSWORD|hx-pass-2026)"? \\./?'],
        output: ["./deploy/db.env:DB_PASSWORD=hx-pass-2026"],
      },
      {
        context: [
          "./deploy/db.env:DB_PASSWORD=hx-pass-2026",
          "# The database team revoked that password and created a new one:",
          "#   new password: Zq7-shadow-2027",
        ],
        goal: "Put the NEW password (read it in the output) in Vault, at the path secret/db, under the key password.",
        hint: "vault kv put, then the path, then key=value with no spaces around the =: here secret/db and password=...",
        accepted: ["vault kv put secret/db password=Zq7-shadow-2027"],
        patterns: ['vault kv put secret/db password="?Zq7-shadow-2027"?'],
        output: ["== Secret Path ==", "secret/data/db", "version    1"],
      },
      {
        context: [
          "$ vault kv get secret/db",
          "====== Data ======",
          "Key         Value",
          "password    Zq7-shadow-2027",
          "# The secret is in the vault. But the old file is still lying around in the repository:",
          "./deploy/db.env:DB_PASSWORD=hx-pass-2026",
        ],
        goal: "Final blow: remove from the Git repository the file that held the password in plain text (its path is in the output).",
        hint: "git rm followed by the file path: everything before the first colon (:) of the line.",
        accepted: ["git rm deploy/db.env", "git rm ./deploy/db.env"],
        output: ["rm 'deploy/db.env'"],
      },
    ],
    defeat:
      "Exposed secret: revoke it, put the new one in the vault (`vault kv put`), then erase it from the code (`git rm`). And never write it in plain text again.",
  },

  helm: {
    moduleId: "helm",
    name: "CrashLoopBackOff",
    title: "The pod that comes back to life only to die",
    intro:
      "Kubernetes automatically restarts a container that crashes. But if it crashes at every start, it runs in a loop: that is CrashLoopBackOff, and this boss never dies until the cause is fixed.",
    color: 0x326ce5,
    phases: [
      {
        context: ["ALERT  Helix's API has been answering 503 for 6 minutes", "# Kubernetes keeps restarting it. Which pod is the problem?"],
        goal: "List the cluster's pods with `kubectl` to spot the one crashing in a loop.",
        hint: "kubectl get pods: get = show, pods = the pods.",
        accepted: ["kubectl get pods", "kubectl get pod", "kubectl get po"],
        output: [
          "NAME                   READY   STATUS             RESTARTS   AGE",
          "api-6f7c9d8b4-r8w2z    0/1     CrashLoopBackOff   9          6m",
          "web-5c8d7f9b4-qm7nz    1/1     Running            0          3h",
        ],
      },
      {
        context: [
          "NAME                   READY   STATUS             RESTARTS   AGE",
          "api-6f7c9d8b4-r8w2z    0/1     CrashLoopBackOff   9          6m",
          "web-5c8d7f9b4-qm7nz    1/1     Running            0          3h",
        ],
        goal: "Read the logs of the pod in CrashLoopBackOff (copy its full name) to find the cause of its crashes.",
        hint: "kubectl logs followed by the pod's full name, read from the NAME column.",
        accepted: [
          "kubectl logs api-6f7c9d8b4-r8w2z",
          "kubectl logs api-6f7c9d8b4-r8w2z --previous",
          "kubectl logs --previous api-6f7c9d8b4-r8w2z",
          "kubectl logs -p api-6f7c9d8b4-r8w2z",
          "kubectl logs api-6f7c9d8b4-r8w2z -p",
        ],
        output: ["Starting API v2.4...", "Error: cannot read /config/api.yaml (file missing)", "Process exiting (code 1)"],
      },
      {
        context: [
          "Error: cannot read /config/api.yaml (file missing)",
          "# ENTROPIA deleted the API's configuration (a ConfigMap).",
          "# You rewrote it in the file api-config.yaml.",
        ],
        goal: "Send the cluster the file you just wrote (its name is in the output) to recreate the missing configuration.",
        hint: "kubectl apply -f followed by the file name: -f = file.",
        accepted: ["kubectl apply -f api-config.yaml", "kubectl apply -f ./api-config.yaml"],
        output: ["configmap/api-config created"],
      },
    ],
    defeat:
      "CrashLoopBackOff: `kubectl get pods` to spot it, `kubectl logs` for the cause, `kubectl apply -f` to fix it. Deleting the pod isn't enough: it would come back with the same error.",
  },

  sync: {
    moduleId: "sync",
    name: "OutOfSync",
    title: "The cluster that no longer listens to Git",
    intro:
      "In GitOps, the cluster must mirror exactly what is written in Git. This boss slips a booby-trapped commit into the configuration repository; you beat it from Git, not by tinkering with the cluster.",
    color: 0xef7b4d,
    phases: [
      {
        context: ["ALERT  the site went down at 23:41, right after an update to the configuration repository", "$ cd ~/helix-config"],
        goal: "Show the last 3 commits of the repository, one per line, to find the culprit.",
        hint: "git log with the --oneline option (one line per commit), then -3 (the last 3).",
        accepted: ["git log --oneline -3", "git log --oneline -n 3", "git log -3 --oneline", "git log -n 3 --oneline", "git log --oneline"],
        output: ["f00dbad (HEAD -> main) scale: replicas: 0", "a1b2c3d move the API to v2.1", "9f8e7d6 add a replica to the front end"],
      },
      {
        context: [
          "f00dbad (HEAD -> main) scale: replicas: 0",
          "a1b2c3d move the API to v2.1",
          "9f8e7d6 add a replica to the front end",
          "# replicas: 0 = no copy of the API left! This ENTROPIA commit is the culprit.",
        ],
        goal: "Undo the faulty commit by creating an inverse commit (you never rewrite shared history). Target it by its ID or by HEAD.",
        hint: "git revert followed by the commit ID (the 7 characters at the start of its line), or HEAD for the latest one.",
        accepted: ["git revert f00dbad", "git revert HEAD", "git revert --no-edit f00dbad", "git revert --no-edit HEAD"],
        output: ["[main 3c4d5e6] Revert \"scale: replicas: 0\"", " 1 file changed, 1 insertion(+), 1 deletion(-)"],
      },
      {
        context: [
          "$ git push",
          "   f00dbad..3c4d5e6  main -> main",
          "$ argocd app get helix",
          "Sync Status:   OutOfSync from main (3c4d5e6)",
          "Health Status: Degraded",
        ],
        goal: "Git is fixed, but the helix application is still OutOfSync. Ask ArgoCD to synchronize it with Git.",
        hint: "argocd app sync followed by the application name (the one after argocd app get).",
        accepted: ["argocd app sync helix"],
        output: ["Operation:     Sync", "Sync Status:   Synced to main (3c4d5e6)", "Health Status: Healthy"],
      },
    ],
    defeat: "In GitOps, Git is the source of truth: `git revert` cleanly undoes a mistake, `argocd app sync` brings the cluster back in line with Git.",
  },

  watchtower: {
    moduleId: "watchtower",
    name: "Alert Storm",
    title: "A thousand alarms, a single cause",
    intro:
      "Too many alerts kill the alert: drowned in notifications, the team can't see what matters. This boss sets off hundreds of alarms to hide one real outage.",
    color: 0xe6522c,
    phases: [
      {
        context: [
          "1,247 alerts in 5 minutes:",
          "ALERT  high CPU on web1",
          "ALERT  high latency on /api/cart",
          "ALERT  500 errors rising",
          "ALERT  high CPU on web1",
          "... (1,243 more)",
          "# They all point to the same machine, web1, which is suffocating. You are logged in to it.",
        ],
        goal: "Show, live, the ranking of the processes on web1 that use the most processor.",
        hint: "The command is called `top`: the top of the ranking, updated live.",
        accepted: ["top", "htop"],
        output: [
          "  PID USER      %CPU %MEM COMMAND",
          " 5150 www-data  198.7 31.2 helix-worker",
          " 4242 www-data   12.0  9.1 helix-api",
          "  812 root        0.3  0.1 sshd",
        ],
      },
      {
        context: [
          "  PID USER      %CPU %MEM COMMAND",
          " 5150 www-data  198.7 31.2 helix-worker",
          " 4242 www-data   12.0  9.1 helix-api",
          "  812 root        0.3  0.1 sshd",
          "# Every program on this machine runs as a systemd service of the same name.",
        ],
        goal: "One process crushes all the others (read its name at the top of the ranking). Read its service's logs with `journalctl`.",
        hint: "journalctl -u followed by the service name (-u = unit, the systemd service).",
        accepted: ["journalctl -u helix-worker", "journalctl -u helix-worker -n 20", "journalctl -u helix-worker.service"],
        patterns: ["journalctl -u helix-worker(\\.service)?( -n \\d+)?", "journalctl -n \\d+ -u helix-worker(\\.service)?"],
        output: [
          "helix-worker[5150]: task \"cart-retry\" started",
          "helix-worker[5150]: WARN the task relaunches itself (infinite loop)",
          "helix-worker[5150]: ERROR 500 returned to /api/cart (x3912)",
        ],
      },
      {
        context: [
          "helix-worker[5150]: WARN the task relaunches itself (infinite loop)",
          "helix-worker[5150]: ERROR 500 returned to /api/cart (x3912)",
          "# A single cause behind 1,247 alerts: this service's loop.",
        ],
        goal: "The cause is found. Cleanly restart the faulty service with `systemctl` to break the loop.",
        hint: "sudo systemctl restart followed by the service name (it appears at the start of every log line).",
        accepted: ["systemctl restart helix-worker", "systemctl restart helix-worker.service"],
        output: [],
      },
    ],
    defeat:
      "A good investigation goes from symptom to cause: `top` (who is using resources?), `journalctl -u` (what does it say?), then a single targeted action. And you alert on what users experience, not on every spike.",
  },

  architect: {
    moduleId: "architect",
    name: "ENTROPIA",
    title: "The single point of failure in person",
    intro:
      "ENTROPIA is the chaos that waits for the smallest weakness: one server, one copy, a backup that was never tested. To beat it, you need an infrastructure that survives the loss of any single piece.",
    color: 0xff003c,
    phases: [
      {
        context: [
          "ENTROPIA: \"All of Helix rests on a single copy of the API. I only have to take it down.\"",
          "# Check what she claims in Kubernetes.",
        ],
        goal: "Show the Kubernetes deployment named api to see how many copies are ready.",
        hint: "kubectl get deployment followed by the deployment name.",
        accepted: ["kubectl get deployment api", "kubectl get deploy api", "kubectl get deployments api", "kubectl get deployment/api"],
        output: ["NAME   READY   UP-TO-DATE   AVAILABLE   AGE", "api    1/1     1            1           42d"],
      },
      {
        context: [
          "NAME   READY   UP-TO-DATE   AVAILABLE   AGE",
          "api    1/1     1            1           42d",
          "# READY 1/1: a single copy. If it falls, everything falls.",
        ],
        goal: "Remove this single point of failure: scale the api deployment to 3 copies (replicas).",
        hint: "kubectl scale deployment api, then the --replicas=3 option (no spaces around the =).",
        accepted: [
          "kubectl scale deployment api --replicas=3",
          "kubectl scale deploy api --replicas=3",
          "kubectl scale deployments api --replicas=3",
          "kubectl scale deployment/api --replicas=3",
          "kubectl scale --replicas=3 deployment api",
          "kubectl scale --replicas=3 deployment/api",
        ],
        output: ["deployment.apps/api scaled"],
      },
      {
        context: [
          "ENTROPIA: \"Three copies? Then I'll wipe the database!\"",
          "$ ls /backups",
          "helix-2026-10-11.dump  helix-2026-10-12.dump",
          "# A backup that was never restored is just a hope. The standby database is called rescue.",
        ],
        goal: "Prove the most recent backup works: restore it into the rescue database with `pg_restore` (full path of the file).",
        hint: "pg_restore -d then the name of the target database, then the /backups/... path of the most recent file (the latest date).",
        accepted: [
          "pg_restore -d rescue /backups/helix-2026-10-12.dump",
          "pg_restore --dbname=rescue /backups/helix-2026-10-12.dump",
          "pg_restore /backups/helix-2026-10-12.dump -d rescue",
        ],
        output: ["pg_restore: connecting to database \"rescue\"", "pg_restore: 42 tables restored, 0 errors"],
      },
    ],
    defeat:
      "No more single point of failure: three replicas (`kubectl scale`) and a backup proven by a real restore (`pg_restore`). Chaos has no hold on an infrastructure built to survive.",
  },
};
