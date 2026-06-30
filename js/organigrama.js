import { ORGANIGRAMA_DATA } from "./organigrama-data.js";

/**
 * Modal de detalle de área (org-modal).
 * Namespace propio: ver css/organigrama.css. No reutiliza .modal-overlay/.modal
 * de components.css porque ese componente ya está tomado por el modal de
 * Mapa de Servicios con una estructura distinta.
 */
let orgModalEl = null;
let lastFocusedEl = null;

function getOrgModalEl() {
  if (!orgModalEl) {
    orgModalEl = document.getElementById("orgModal");
  }
  return orgModalEl;
}

function openOrgModal({ title, subtitle = "", bodyHTML = "" }) {
  const modal = getOrgModalEl();
  if (!modal) return;

  lastFocusedEl = document.activeElement;

  modal.querySelector(".org-modal__title").textContent = title;
  const subtitleEl = modal.querySelector(".org-modal__subtitle");
  subtitleEl.textContent = subtitle;
  subtitleEl.hidden = !subtitle;

  modal.querySelector(".org-modal__body").innerHTML = bodyHTML;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modal.querySelector(".org-modal__close").focus();

  document.addEventListener("keydown", handleOrgModalKeydown);
}

function closeOrgModal() {
  const modal = getOrgModalEl();
  if (!modal) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", handleOrgModalKeydown);

  if (lastFocusedEl) lastFocusedEl.focus();
}

function handleOrgModalKeydown(event) {
  if (event.key === "Escape") closeOrgModal();
}

function initOrgModal() {
  const modal = getOrgModalEl();
  if (!modal) return;

  modal.querySelector(".org-modal__backdrop").addEventListener("click", closeOrgModal);
  modal.querySelector(".org-modal__close").addEventListener("click", closeOrgModal);
}

/**
 * Renderiza una lista de strings dentro del modal, o un placeholder si está vacía.
 */
function renderListOrPlaceholder(items) {
  if (!items || items.length === 0) {
    return `<p class="org-modal__placeholder">Pendiente de carga.</p>`;
  }
  return `<ul class="org-modal__list">${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

/**
 * Arma el contenido HTML del modal de detalle para un nodo del organigrama.
 */
function buildAreaDetailMarkup(node) {
  return `
    <div class="org-modal__section">
      <p class="org-modal__section-title">Responsable</p>
      <p>${node.responsable || "Sin asignar"}</p>
    </div>
    ${node.cargo ? `
    <div class="org-modal__section">
      <p class="org-modal__section-title">Cargo</p>
      <p>${node.cargo}</p>
    </div>` : ""}
    <div class="org-modal__section">
      <p class="org-modal__section-title">Funciones generales</p>
      ${renderListOrPlaceholder(node.funcionesGenerales)}
    </div>
    <div class="org-modal__section">
      <p class="org-modal__section-title">Funciones por cargo</p>
      ${renderListOrPlaceholder(node.funcionesCargo)}
    </div>
  `;
}

function openAreaDetail(node) {
  openOrgModal({
    title: node.area,
    subtitle: node.cargo || "",
    bodyHTML: buildAreaDetailMarkup(node)
  });
}

/**
 * Crea el <li> de un nodo del organigrama, con su toggle (si tiene hijos)
 * y su card clickeable que abre el modal de detalle.
 */
function renderOrgNode(node, isRoot = false) {
  const li = document.createElement("li");
  li.className = "org-node";

  const row = document.createElement("div");
  row.className = "org-node__row";

  const hasChildren = node.children && node.children.length > 0;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "org-node__toggle" + (hasChildren ? "" : " org-node__toggle--spacer");
  if (hasChildren) {
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", `Contraer/expandir ${node.area}`);
    toggle.textContent = "▸";
  } else {
    toggle.setAttribute("aria-hidden", "true");
    toggle.tabIndex = -1;
  }

  const card = document.createElement("button");
  card.type = "button";
  card.className = "org-node__card" + (isRoot ? " org-node__card--root" : "") + (node.type === "item" ? " org-node__card--item" : "");
  card.innerHTML = `
    <span class="org-node__area">${node.area}</span>
    ${node.responsable ? `<span class="org-node__responsable">${node.responsable}</span>` : ""}
    ${node.cargo ? `<span class="org-node__cargo">${node.cargo}</span>` : ""}
  `;
  card.addEventListener("click", () => openAreaDetail(node));

  row.appendChild(toggle);
  row.appendChild(card);
  li.appendChild(row);

  if (hasChildren) {
    const childrenWrapper = document.createElement("div");
    childrenWrapper.className = "org-node__children";

    const childList = document.createElement("ul");
    childList.className = "org-chart__list";
    node.children.forEach(child => childList.appendChild(renderOrgNode(child)));

    childrenWrapper.appendChild(childList);
    li.appendChild(childrenWrapper);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      childrenWrapper.style.display = expanded ? "none" : "";
    });
  }

  return li;
}

function renderOrgChart(rootNode, container) {
  const rootList = document.createElement("ul");
  rootList.className = "org-chart__list";
  rootList.appendChild(renderOrgNode(rootNode, true));
  container.appendChild(rootList);
}

document.addEventListener("DOMContentLoaded", () => {
  initOrgModal();
  const container = document.getElementById("orgChart");
  if (container) {
    renderOrgChart(ORGANIGRAMA_DATA, container);
  }
});
