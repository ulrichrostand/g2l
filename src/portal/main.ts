import { element, requireElement } from "../ui/dom";
import { availableCount, COURSES, playHref, SCREENSHOTS, type Course, type Screenshot } from "./catalog";
import { PortalGate } from "./portalGate";
import "./portal.css";

/** Nom provisoire du site : une seule constante à changer le jour où la marque est choisie. */
const SITE_NAME = "Cellule Écho";
const BASE = import.meta.env.BASE_URL;
const SVG_NS = "http://www.w3.org/2000/svg";

function link(label: string, href: string, className: string, external = false): HTMLAnchorElement {
  const attributes: Record<string, string> = { href };
  // Lien sortant : pas de fuite de l'adresse d'origine ni d'accès à la fenêtre d'ouverture.
  if (external) Object.assign(attributes, { target: "_blank", rel: "noopener noreferrer" });
  return element("a", { className, text: label, attributes });
}

/** Marque du site : un anneau et son cœur, en géométrie exacte (pas de glyphe ni d'emoji). */
function brandMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("class", "brand-mark");
  svg.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(SVG_NS, "circle");
  Object.entries({ cx: "16", cy: "16", r: "11", fill: "none", stroke: "currentColor", "stroke-width": "3" }).forEach(([name, value]) => ring.setAttribute(name, value));
  const core = document.createElementNS(SVG_NS, "circle");
  Object.entries({ cx: "16", cy: "16", r: "4", fill: "currentColor" }).forEach(([name, value]) => core.setAttribute(name, value));
  svg.append(ring, core);
  return svg;
}

function image(src: string, alt: string, className: string, focus?: string): HTMLImageElement {
  const node = element("img", { className, attributes: { src: `${BASE}${src}`, alt, loading: "lazy", decoding: "async" } });
  // Valeur validée par le catalogue (« x% y% ») : posée en propriété de style, jamais concaténée dans du HTML.
  if (focus) node.style.objectPosition = focus;
  return node;
}

/** Visuel d'une carte : la vraie capture du jeu, ou une affiche typographique tant que le jeu n'existe pas. */
function courseVisual(course: Course): HTMLElement {
  if (course.cover) return element("div", { className: "game-visual" }, [image(course.cover.src, course.cover.alt, "game-image", course.cover.focus)]);
  return element("div", { className: "game-visual poster", attributes: { "aria-hidden": "true" } }, [element("span", { className: "poster-monogram", text: course.monogram })]);
}

function gameCard(course: Course): HTMLElement {
  const href = playHref(course, BASE);
  const action = href ? link("Jouer", href, "btn btn-primary") : element("span", { className: "game-soon", text: "Bientôt disponible" });
  return element("article", { className: `game-card ${course.status}` }, [
    courseVisual(course),
    element("div", { className: "game-text" }, [
      element("p", { className: "game-genre", text: `${course.genre} · ${course.role}` }),
      element("h3", { text: course.title }),
      element("p", { className: "game-scenario", text: course.scenario }),
      element("p", { className: "game-topics", text: course.topics.join(" · ") }),
      element("div", { className: "game-actions" }, [
        action,
        course.roadmapUrl ? link("Roadmap suivie", course.roadmapUrl, "text-link", true) : null,
      ]),
    ]),
  ]);
}

function galleryItem(shot: Screenshot): HTMLElement {
  return element("figure", { className: "shot" }, [image(shot.src, shot.alt, "shot-image", shot.focus), element("figcaption", { text: shot.caption })]);
}

function hero(): HTMLElement {
  const canvas = element("canvas", { className: "portal-canvas", attributes: { "aria-hidden": "true" } });
  const playable = availableCount(COURSES);
  const section = element("section", { className: "hero" }, [
    element("div", { className: "hero-copy" }, [
      element("h1", { text: "Apprends la tech en jouant" }),
      element("p", { className: "hero-lead", text: "Chaque jeu suit une roadmap de roadmap.sh et te plonge dans une situation à résoudre : infiltration, enquête, intrusion. Tu tapes de vraies commandes, sans aucun prérequis." }),
      element("div", { className: "hero-actions" }, [link("Choisir un jeu", "#jeux", "btn btn-primary"), link("Comment ça marche", "#methode", "btn btn-outline")]),
      element("p", { className: "hero-note", text: `${COURSES.length} jeux annoncés · ${playable} jouable${playable > 1 ? "s" : ""} aujourd'hui` }),
    ]),
    element("div", { className: "hero-portal" }, [canvas]),
  ]);
  // Le canvas doit être dans le document pour connaître sa taille : montage au prochain tour de boucle.
  queueMicrotask(() => {
    const gate = PortalGate.mount(canvas);
    if (!gate) {
      canvas.hidden = true;
      return;
    }
    window.addEventListener("resize", () => gate.resize(), { passive: true });
  });
  return section;
}

function practice(): HTMLElement {
  const items = [
    ["Un jeu par métier", "Chaque jeu suit l'ordre de la roadmap correspondante de roadmap.sh."],
    ["Un scénario qui donne un enjeu", "Tu apprends en résolvant une situation, avec de vraies commandes."],
    ["Un bilan honnête", "Examens, notions à revoir et progression par thème."],
  ];
  return element("section", { className: "practice", attributes: { id: "methode", "aria-labelledby": "methode-title" } }, [
    element("div", { className: "practice-visual" }, [
      image("portal/devops-agent.webp", "L'agent personnalisé dans le créateur de personnage.", "practice-back"),
      image("portal/devops-lecon.webp", "Fiche de leçon avant de pirater un terminal.", "practice-front"),
    ]),
    element("div", { className: "practice-copy" }, [
      element("h2", { text: "Apprendre en agissant", attributes: { id: "methode-title" } }),
      element("dl", { className: "practice-list" }, items.map(([title, text]) => element("div", {}, [element("dt", { text: title }), element("dd", { text: text })]))),
      element("div", { className: "hero-actions" }, [link("Choisir un jeu", "#jeux", "btn btn-primary")]),
    ]),
  ]);
}

function upcoming(): HTMLElement {
  const next = COURSES.filter((course) => course.status === "soon").map((course) => course.title.split(" : ")[0]);
  const first = COURSES.find((course) => course.status === "available");
  const href = first ? playHref(first, BASE) : null;
  return element("section", { className: "band", attributes: { "aria-labelledby": "band-title" } }, [
    element("div", { className: "band-inner" }, [
      element("h2", { text: "D'autres jeux arrivent", attributes: { id: "band-title" } }),
      element("p", { text: `${next.join(", ")} : chacun avec son scénario et sa roadmap. En attendant, la première mission t'attend.` }),
      href ? link(`Jouer à ${first?.title.split(" : ")[1] ?? "la première mission"}`, href, "btn btn-dark") : null,
    ]),
  ]);
}

function footer(): HTMLElement {
  const games = COURSES.map((course) => {
    const href = playHref(course, BASE);
    return element("li", {}, [href ? link(course.title, href, "footer-link") : element("span", { className: "footer-muted", text: `${course.title} (bientôt)` })]);
  });
  const roadmaps = COURSES.filter((course) => course.roadmapUrl).map((course) => element("li", {}, [link(course.role, course.roadmapUrl as string, "footer-link", true)]));
  return element("footer", { className: "site-footer" }, [
    element("div", { className: "footer-grid" }, [
      element("div", { className: "footer-about" }, [
        element("a", { className: "brand", attributes: { href: BASE } }, [brandMark(), document.createTextNode(SITE_NAME)]),
        element("p", { text: "Des jeux pour apprendre les métiers de la tech, fidèles aux roadmaps de roadmap.sh. Projet indépendant, non affilié." }),
      ]),
      element("nav", { attributes: { "aria-label": "Jeux" } }, [element("h3", { text: "Jeux" }), element("ul", {}, games)]),
      element("nav", { attributes: { "aria-label": "Roadmaps" } }, [element("h3", { text: "Roadmaps" }), element("ul", {}, roadmaps)]),
      element("div", {}, [
        element("h3", { text: "Crédits" }),
        element("ul", {}, [
          element("li", { className: "footer-muted", text: "Personnages 3D : Quaternius (CC0)" }),
          element("li", { className: "footer-muted", text: "Polices : Chakra Petch et Barlow (SIL OFL)" }),
          element("li", {}, [link("roadmap.sh", "https://roadmap.sh/", "footer-link", true)]),
        ]),
      ]),
    ]),
  ]);
}

function render(root: HTMLElement): void {
  root.replaceChildren(
    element("header", { className: "site-header" }, [
      element("div", { className: "header-inner" }, [
        element("a", { className: "brand", attributes: { href: BASE } }, [brandMark(), document.createTextNode(SITE_NAME)]),
        element("nav", { className: "main-nav", attributes: { "aria-label": "Navigation principale" } }, [link("Jeux", "#jeux", "nav-link"), link("Aperçu", "#apercu", "nav-link"), link("Méthode", "#methode", "nav-link")]),
        link("Jouer", "#jeux", "btn btn-outline btn-small"),
      ]),
    ]),
    element("main", {}, [
      hero(),
      element("section", { className: "section", attributes: { id: "jeux", "aria-labelledby": "jeux-title" } }, [
        element("h2", { text: "Choisis ton jeu", attributes: { id: "jeux-title" } }),
        element("div", { className: "game-row" }, COURSES.map(gameCard)),
      ]),
      element("section", { className: "section", attributes: { id: "apercu", "aria-labelledby": "apercu-title" } }, [
        element("h2", { className: "centered", text: "Dans les jeux", attributes: { id: "apercu-title" } }),
        element("div", { className: "gallery" }, SCREENSHOTS.map(galleryItem)),
      ]),
      practice(),
      upcoming(),
    ]),
    footer(),
  );
}

render(requireElement("#portal"));
