import { LANG } from "../i18n/lang";
import { t } from "../i18n/messages/portal";
import { autoRedirectTarget, readStoredLang } from "../i18n/preference";
import { REPOSITORY_URL } from "../content/links";
import { legalPath, portalPath } from "../i18n/routes";
import { isSingular } from "../i18n/lang";
import { createLanguageSwitch } from "../i18n/switcher";
import { element, requireElement } from "../ui/dom";
import { availableCount, COURSES, playHref, SCREENSHOTS, textOf, type Course, type Screenshot } from "./catalog";
import { PortalGate } from "./portalGate";
import "./portal.css";

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
  const alt = textOf(course, LANG).coverAlt;
  if (course.cover && alt) return element("div", { className: "game-visual" }, [image(course.cover.src, alt, "game-image", course.cover.focus)]);
  return element("div", { className: "game-visual poster", attributes: { "aria-hidden": "true" } }, [element("span", { className: "poster-monogram", text: course.monogram })]);
}

function gameCard(course: Course): HTMLElement {
  const text = textOf(course, LANG);
  const href = playHref(course, LANG, BASE);
  const action = href ? link(t("play"), href, "btn btn-primary") : element("span", { className: "game-soon", text: t("comingSoon") });
  return element("article", { className: `game-card ${course.status}` }, [
    courseVisual(course),
    element("div", { className: "game-text" }, [
      element("p", { className: "game-genre", text: `${text.genre} · ${text.role}` }),
      element("h3", { text: text.title }),
      element("p", { className: "game-scenario", text: text.scenario }),
      element("p", { className: "game-topics", attributes: { "aria-label": t("topicsLabel") }, text: text.topics.join(" · ") }),
      element("div", { className: "game-actions" }, [
        action,
        course.roadmapUrl ? link(t("roadmapFollowed"), course.roadmapUrl, "text-link", true) : null,
      ]),
    ]),
  ]);
}

function galleryItem(shot: Screenshot): HTMLElement {
  const text = shot.text[LANG];
  return element("figure", { className: "shot" }, [image(shot.src, text.alt, "shot-image", shot.focus), element("figcaption", { text: text.caption })]);
}

function hero(): HTMLElement {
  const canvas = element("canvas", { className: "portal-canvas", attributes: { "aria-hidden": "true" } });
  const playable = availableCount(COURSES);
  const section = element("section", { className: "hero" }, [
    element("div", { className: "hero-copy" }, [
      element("h1", { text: t("heroTitle") }),
      element("p", { className: "hero-lead", text: t("heroLead") }),
      element("div", { className: "hero-actions" }, [link(t("pickGame"), "#jeux", "btn btn-primary"), link(t("howItWorks"), "#methode", "btn btn-outline")]),
      element("p", { className: "hero-note", text: t(isSingular(playable) ? "heroNoteOne" : "heroNoteOther", { total: COURSES.length, playable }) }),
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
    [t("practiceGameTitle"), t("practiceGameText")],
    [t("practiceStoryTitle"), t("practiceStoryText")],
    [t("practiceReviewTitle"), t("practiceReviewText")],
  ];
  return element("section", { className: "practice", attributes: { id: "methode", "aria-labelledby": "methode-title" } }, [
    element("div", { className: "practice-visual" }, [
      image("portal/devops-agent.webp", t("practiceAgentAlt"), "practice-back"),
      image("portal/devops-lecon.webp", t("practiceLessonAlt"), "practice-front"),
    ]),
    element("div", { className: "practice-copy" }, [
      element("h2", { text: t("learnByDoing"), attributes: { id: "methode-title" } }),
      element("dl", { className: "practice-list" }, items.map(([title, text]) => element("div", {}, [element("dt", { text: title }), element("dd", { text })]))),
      element("div", { className: "hero-actions" }, [link(t("pickGame"), "#jeux", "btn btn-primary")]),
    ]),
  ]);
}

function upcoming(): HTMLElement {
  const next = COURSES.filter((course) => course.status === "soon").map((course) => textOf(course, LANG).field);
  const first = COURSES.find((course) => course.status === "available");
  const href = first ? playHref(first, LANG, BASE) : null;
  return element("section", { className: "band", attributes: { "aria-labelledby": "band-title" } }, [
    element("div", { className: "band-inner" }, [
      element("h2", { text: t("bandTitle"), attributes: { id: "band-title" } }),
      element("p", { text: t("bandText", { names: next.join(", ") }) }),
      href && first ? link(t("bandPlay", { name: textOf(first, LANG).name }), href, "btn btn-dark") : null,
    ]),
  ]);
}

function footer(): HTMLElement {
  const games = COURSES.map((course) => {
    const text = textOf(course, LANG);
    const href = playHref(course, LANG, BASE);
    return element("li", {}, [href ? link(text.title, href, "footer-link") : element("span", { className: "footer-muted", text: t("footerGamesSoon", { title: text.title }) })]);
  });
  const roadmaps = COURSES.filter((course) => course.roadmapUrl).map((course) => element("li", {}, [link(textOf(course, LANG).role, course.roadmapUrl as string, "footer-link", true)]));
  return element("footer", { className: "site-footer" }, [
    element("div", { className: "footer-grid" }, [
      element("div", { className: "footer-about" }, [
        element("a", { className: "brand", attributes: { href: portalPath(LANG, BASE) } }, [brandMark(), document.createTextNode(t("siteName"))]),
        element("p", { text: t("footerAbout") }),
      ]),
      element("nav", { attributes: { "aria-label": t("footerGames") } }, [element("h3", { text: t("footerGames") }), element("ul", {}, games)]),
      element("nav", { attributes: { "aria-label": t("footerRoadmaps") } }, [element("h3", { text: t("footerRoadmaps") }), element("ul", {}, roadmaps)]),
      element("div", {}, [
        element("h3", { text: t("footerCredits") }),
        element("ul", {}, [
          element("li", { className: "footer-muted", text: t("footerCreditCharacters") }),
          element("li", { className: "footer-muted", text: t("footerCreditFonts") }),
          element("li", {}, [link("roadmap.sh", "https://roadmap.sh/", "footer-link", true)]),
          element("li", {}, [link(t("footerLegal"), legalPath(LANG, BASE), "footer-link")]),
          element("li", {}, [link(t("footerSource"), REPOSITORY_URL, "footer-link", true)]),
        ]),
      ]),
    ]),
  ]);
}

function render(root: HTMLElement): void {
  const switcher = createLanguageSwitch(window.location.pathname, BASE);
  root.replaceChildren(
    element("header", { className: "site-header" }, [
      element("div", { className: "header-inner" }, [
        element("a", { className: "brand", attributes: { href: portalPath(LANG, BASE) } }, [brandMark(), document.createTextNode(t("siteName"))]),
        element("nav", { className: "main-nav", attributes: { "aria-label": t("mainNavLabel") } }, [link(t("navGames"), "#jeux", "nav-link"), link(t("navPreview"), "#apercu", "nav-link"), link(t("navMethod"), "#methode", "nav-link")]),
        switcher,
        link(t("navPlay"), "#jeux", "btn btn-outline btn-small"),
      ]),
    ]),
    element("main", {}, [
      hero(),
      element("section", { className: "section", attributes: { id: "jeux", "aria-labelledby": "jeux-title" } }, [
        element("h2", { text: t("chooseYourGame"), attributes: { id: "jeux-title" } }),
        element("div", { className: "game-row" }, COURSES.map(gameCard)),
      ]),
      element("section", { className: "section", attributes: { id: "apercu", "aria-labelledby": "apercu-title" } }, [
        element("h2", { className: "centered", text: t("insideTheGames"), attributes: { id: "apercu-title" } }),
        element("div", { className: "gallery" }, SCREENSHOTS.map(galleryItem)),
      ]),
      practice(),
      upcoming(),
    ]),
    footer(),
  );
}

/** Première visite d'un anglophone sur l'accueil français : on l'envoie sur la version anglaise (une seule fois, jamais en boucle). */
function redirectToPreferredLanguage(): boolean {
  const target = autoRedirectTarget(LANG, readStoredLang(), navigator.languages ?? []);
  if (target === null) return false;
  window.location.replace(portalPath(target, BASE));
  return true;
}

if (!redirectToPreferredLanguage()) render(requireElement("#portal"));
