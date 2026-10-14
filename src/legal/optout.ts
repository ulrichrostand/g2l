import { isOptedOut, setOptOut, trackPageview } from "../analytics/track";

/**
 * Bouton « Refuser la mesure d'audience » des mentions légales. Les libellés viennent des attributs data-* de la page
 * (une page par langue) : le script ne contient aucun texte à traduire.
 */
function init(): void {
  const button = document.querySelector<HTMLButtonElement>("#optout");
  const status = document.querySelector<HTMLElement>("#optout-status");
  if (!button || !status) throw new Error("Bouton de refus de la mesure d'audience introuvable");

  const render = (): void => {
    const optedOut = isOptedOut();
    button.textContent = (optedOut ? button.dataset.labelEnable : button.dataset.labelDisable) ?? "";
    status.textContent = (optedOut ? status.dataset.statusOff : status.dataset.statusOn) ?? "";
  };
  button.addEventListener("click", () => {
    const saved = setOptOut(!isOptedOut());
    render();
    // Stockage bloqué : le choix ne peut pas être conservé, on le dit au lieu de laisser croire qu'il a été pris en compte.
    if (!saved) status.textContent = status.dataset.statusFail ?? "";
  });
  render();
  trackPageview(import.meta.env.BASE_URL);
}

init();
