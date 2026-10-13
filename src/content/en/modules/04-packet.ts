import type { DevOpsModule } from "../../types";

export const packetModuleEn: DevOpsModule = {
  id: "packet",
  codename: "Operation PACKET",
  title: "Networking Basics",
  roadmapSection: "Networking & Protocols",
  roadmapTopics: ["IP address", "DNS", "Ports", "HTTP / HTTPS", "SSH"],
  briefing:
    "Helix Corp's telecom center has gone down. To reroute the traffic, you need to understand how machines find each other and talk on a network.",
  lessons: [
    {
      title: "The IP address",
      summary:
        "Every machine on a network has an IP address, for example `192.168.1.10`. It is how data knows where to go.",
      analogy: "An IP address is the machine's street address: without it, the mail carrier does not know where to deliver the package.",
      keyPoint: "An IP address identifies a machine on the network.",
    },
    {
      title: "DNS",
      summary:
        "Nobody remembers addresses like `142.250.74.110`. DNS translates an easy name (`google.com`) into an IP address. It is the first step whenever you open a website.",
      analogy: "DNS is the phone book of the Internet: you look up a name, and it gives you the number.",
      keyPoint: "DNS translates a domain name into an IP address.",
    },
    {
      title: "Ports",
      summary:
        "A machine can offer several services at the same time. Each one listens on a numbered port: 80 for the web (HTTP), 443 for the secure web (HTTPS), 22 for SSH.",
      analogy: "If the IP address is the building's address, the port is the apartment number.",
      keyPoint: "Ports to know: 80 (HTTP), 443 (HTTPS), 22 (SSH).",
    },
    {
      title: "HTTP and HTTPS",
      summary:
        "HTTP is the language of the web: the browser asks for a page, and the server answers with a code. 200 = OK, 404 = page not found, 500 = server error. HTTPS is HTTP encrypted: nobody can read what goes through (the little padlock).",
      analogy: "HTTP is a postcard anyone can read; HTTPS is a letter in a sealed envelope.",
      keyPoint: "HTTPS encrypts the exchange; HTTP codes: 200 OK, 404 not found, 500 server error.",
    },
    {
      title: "SSH: connecting remotely",
      summary:
        "SSH lets you open a terminal on a remote server, in an encrypted way. You type `ssh user@address`.",
      analogy: "It is a secure remote control that lets you operate a computer on the other side of the world.",
      example: { code: "ssh deploy@10.0.0.5", meaning: "Connects to the server 10.0.0.5 as the user deploy." },
      keyPoint: "`ssh user@address` opens a secure terminal on a remote server.",
    },
  ],
  challenges: [
    {
      kind: "choice",
      prompt: "What is an IP address for?",
      options: ["To encrypt a password", "To identify a machine on the network", "To name a file", "To measure Internet speed"],
      correctIndex: 1,
      explanation: "The IP address tells data where to go, like a street address.",
    },
    {
      kind: "choice",
      prompt: "What does DNS do?",
      options: [
        "It translates a domain name (google.com) into an IP address",
        "It blocks viruses",
        "It speeds up the Wi-Fi connection",
        "It stores passwords",
      ],
      correctIndex: 0,
      explanation: "DNS is the Internet's phone book: name → IP address.",
    },
    {
      kind: "choice",
      prompt: "On which port does an HTTPS website answer by default?",
      options: ["22", "80", "443", "8080"],
      correctIndex: 2,
      explanation: "443 for HTTPS, 80 for HTTP, 22 for SSH.",
    },
    {
      kind: "choice",
      prompt: "Your browser shows \"Error 404\". What does that mean?",
      options: ["The server crashed", "The requested page was not found", "Everything is fine", "The password is wrong"],
      correctIndex: 1,
      explanation: "404 = not found. 500 would mean a failure on the server side, 200 that everything is fine.",
    },
    {
      kind: "command",
      prompt: "Connect over SSH to the server 10.0.0.5 as the user deploy.",
      acceptedAnswers: ["ssh deploy@10.0.0.5", "ssh -l deploy 10.0.0.5"],
      hint: "ssh user@address",
      explanation: "`ssh deploy@10.0.0.5` opens a secure terminal on the server.",
    },
  ],
};
