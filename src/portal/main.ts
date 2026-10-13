import { element, requireElement } from "../ui/dom";
import { availableCount, COURSES, playHref, type Course } from "./catalog";
import "./portal.css";

/** Nom provisoire du site : une seule constante à changer le jour où la marque est choisie. */
const SITE_NAME = "Cellule Écho";

function link(label: string, href: string, className: string, external = false): HTMLAnchorElement {
  const attributes: Record<string, string> = { href };
  // Lien sortant : pas de fuite de l'adresse d'origine ni d'accès à la fenêtre d'ouverture.
  if (external) Object.assign(attributes, { target: "_blank", rel: "noopener noreferrer" });
  return element("a", { className, text: label, attributes });
}

function courseCard(course: Course): HTMLElement {
  const href = playHref(course, import.meta.env.BASE_URL);
  const card = element("article", { className: `course-card ${course.status}` });
  // Couleur validée par le catalogue (#rrggbb) : posée en variable CSS, jamais concaténée dans du HTML.
  card.style.setProperty("--card-accent", course.accent);
  const action = href
    ? link("Jouer", href, "btn primary")
    : element("span", { className: "course-soon", text: "Bientôt disponible" });
  card.append(
    element("div", { className: "course-meta" }, [
      element("span", { className: "course-genre", text: course.genre }),
      element("span", { className: `course-status ${course.status}`, text: course.status === "available" ? "Jouable" : "En préparation" }),
    ]),
    element("h3", { text: course.title }),
    element("p", { className: "course-role", text: `Métier visé : ${course.role}` }),
    element("p", { className: "course-scenario", text: course.scenario }),
    element("ul", { className: "chips", attributes: { "aria-label": "Notions abordées" } }, course.topics.map((topic) => element("li", { text: topic }))),
    element("div", { className: "course-footer" }, [
      action,
      course.durationHint ? element("span", { className: "course-duration", text: course.durationHint }) : null,
      course.roadmapUrl ? link("Roadmap suivie", course.roadmapUrl, "course-roadmap", true) : null,
    ]),
  );
  return card;
}

function steps(): HTMLElement {
  const items = [
    ["Choisis un parcours", "Chaque parcours cible un métier et suit la roadmap correspondante de roadmap.sh."],
    ["Joue le scénario", "Une histoire, des défis, de vraies commandes : tu apprends en agissant, pas en lisant."],
    ["Valide tes compétences", "Examens, bilan par thème et notions à revoir pour savoir où tu en es."],
  ];
  return element(
    "ol",
    { className: "steps" },
    items.map(([title, text], index) =>
      element("li", {}, [element("span", { className: "step-number", text: String(index + 1) }), element("h3", { text: title }), element("p", { text: text })]),
    ),
  );
}

function render(root: HTMLElement): void {
  const playable = availableCount(COURSES);
  root.replaceChildren(
    element("header", { className: "site-header" }, [
      element("a", { className: "brand", text: SITE_NAME, attributes: { href: import.meta.env.BASE_URL } }),
      element("nav", { attributes: { "aria-label": "Navigation principale" } }, [
        link("Parcours", "#parcours", "nav-link"),
        link("Comment ça marche", "#methode", "nav-link"),
      ]),
    ]),
    element("main", {}, [
      element("section", { className: "hero" }, [
        element("p", { className: "eyebrow", text: "Apprendre en jouant" }),
        element("h1", { text: "Apprends un métier de la tech en le jouant." }),
        element("p", { className: "lead", text: "Des parcours interactifs fidèles aux roadmaps de roadmap.sh : un scénario qui donne du sens, de vraies commandes, aucune connaissance requise." }),
        element("div", { className: "hero-actions" }, [link("Voir les parcours", "#parcours", "btn primary big")]),
        element("p", { className: "hero-note", text: `${playable} parcours jouable${playable > 1 ? "s" : ""} · ${COURSES.length - playable} en préparation` }),
      ]),
      element("section", { className: "section", attributes: { id: "parcours", "aria-labelledby": "parcours-title" } }, [
        element("h2", { text: "Les parcours", attributes: { id: "parcours-title" } }),
        element("div", { className: "course-grid" }, COURSES.map(courseCard)),
      ]),
      element("section", { className: "section", attributes: { id: "methode", "aria-labelledby": "methode-title" } }, [
        element("h2", { text: "Comment ça marche", attributes: { id: "methode-title" } }),
        steps(),
      ]),
    ]),
    element("footer", { className: "site-footer" }, [
      element("p", {}, [
        document.createTextNode("Les parcours s'appuient sur les roadmaps de "),
        link("roadmap.sh", "https://roadmap.sh/", "", true),
        document.createTextNode(". Projet indépendant, non affilié à roadmap.sh."),
      ]),
    ]),
  );
}

render(requireElement("#portal"));
