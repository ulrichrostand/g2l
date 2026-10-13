import { element, requireElement } from "../ui/dom";
import { COURSES, playHref, type Course } from "./catalog";
import "./portal.css";

/** Nom provisoire du site : une seule constante à changer le jour où la marque est choisie. */
const SITE_NAME = "Cellule Écho";

function link(label: string, href: string, className: string, external = false): HTMLAnchorElement {
  const attributes: Record<string, string> = { href };
  // Lien sortant : pas de fuite de l'adresse d'origine ni d'accès à la fenêtre d'ouverture.
  if (external) Object.assign(attributes, { target: "_blank", rel: "noopener noreferrer" });
  return element("a", { className, text: label, attributes });
}

/** Une ligne de l'index des parcours : numéro, titre, scénario, notions, accès. */
function courseRow(course: Course, index: number): HTMLElement {
  const href = playHref(course, import.meta.env.BASE_URL);
  const action = href ? link("Jouer", href, "play-link") : element("span", { className: "soon", text: "Bientôt" });
  const details = [`Métier : ${course.role}`, course.durationHint].filter((part): part is string => part !== null);
  return element("li", { className: `course ${course.status}` }, [
    element("span", { className: "course-index", text: String(index + 1).padStart(2, "0"), attributes: { "aria-hidden": "true" } }),
    element("div", { className: "course-main" }, [
      element("h3", { text: course.title }),
      element("p", { className: "course-genre", text: course.genre }),
    ]),
    element("div", { className: "course-body" }, [
      element("p", { text: course.scenario }),
      element("p", { className: "course-topics", text: course.topics.join(" · ") }),
      element("p", { className: "course-details" }, [
        document.createTextNode(details.join(" — ")),
        course.roadmapUrl ? document.createTextNode(" — ") : null,
        course.roadmapUrl ? link("Roadmap suivie", course.roadmapUrl, "text-link", true) : null,
      ]),
    ]),
    element("div", { className: "course-action" }, [action]),
  ]);
}

function method(): HTMLElement {
  const items = [
    ["Un parcours par métier", "Chaque parcours suit la roadmap correspondante de roadmap.sh, dans l'ordre."],
    ["Un scénario qui donne un enjeu", "On apprend en résolvant une situation, avec de vraies commandes, pas en lisant un cours."],
    ["Un bilan honnête", "Examens, notions à revoir et progression par thème : tu sais où tu en es."],
  ];
  return element(
    "div",
    { className: "method" },
    items.map(([title, text]) => element("div", {}, [element("h3", { text: title }), element("p", { text: text })])),
  );
}

function render(root: HTMLElement): void {
  root.replaceChildren(
    element("header", { className: "site-header" }, [
      element("div", { className: "bar" }, [
        element("a", { className: "brand", text: SITE_NAME, attributes: { href: import.meta.env.BASE_URL } }),
        element("nav", { attributes: { "aria-label": "Navigation principale" } }, [link("Parcours", "#parcours", "nav-link"), link("Méthode", "#methode", "nav-link")]),
      ]),
    ]),
    element("main", { className: "page" }, [
      element("section", { className: "intro" }, [
        element("h1", { text: "Apprendre un métier de la tech en y jouant" }),
        element("p", { text: "Des parcours interactifs fidèles aux roadmaps de roadmap.sh. Chaque parcours raconte une situation à résoudre : tu pratiques de vraies commandes, sans connaissance préalable." }),
      ]),
      element("section", { attributes: { id: "parcours", "aria-labelledby": "parcours-title" } }, [
        element("h2", { text: "Parcours", attributes: { id: "parcours-title" } }),
        element("ol", { className: "courses" }, COURSES.map(courseRow)),
      ]),
      element("section", { attributes: { id: "methode", "aria-labelledby": "methode-title" } }, [element("h2", { text: "Méthode", attributes: { id: "methode-title" } }), method()]),
    ]),
    element("footer", { className: "site-footer" }, [
      element("div", { className: "bar" }, [
        element("p", {}, [
          document.createTextNode("Les parcours s'appuient sur les roadmaps de "),
          link("roadmap.sh", "https://roadmap.sh/", "text-link", true),
          document.createTextNode(". Projet indépendant, non affilié."),
        ]),
      ]),
    ]),
  );
}

render(requireElement("#portal"));
