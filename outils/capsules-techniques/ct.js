import { Dropdown } from "../components/dropdown/dropdown.js";
import { MemberData } from "./member-data.js";

// ==========================================================
// THEMIS — CT
// ==========================================================

// = CONFIGURATION

const CT = {
  url: "https://opensheet.elk.sh/1fe7PDfHyIdCNn4zq34xA8pwcjlwnhq-Fx1VnoBgkykg/ct",

  container: document.querySelector(".ct-list"),

  typeFilter: "#ct-type-filter",
  inventoryFilter: "#ct-inventory-filter",
  teamFilter: "#ct-team-filter",
  searchInput: "#ct-search",
  teamButton: "#ct-team-load",

  types: ["Acier", "Combat", "Dragon", "Eau", "Électrik", "Fée", "Feu", "Glace", "Insecte", "Normal", "Plante", "Poison", "Psy", "Roche", "Sol", "Spectre", "Ténèbres", "Vol"],
};

const POKEMON = {
  url: "https://opensheet.elk.sh/1MVWTjX6bKpFbxi9wcDWNlwmLTWL-P1wXSk-aHHpXhAY/Sheet1",
};

// = DONNÉES

let ctList = [];
let pokemonList = [];
let speciesById = new Map();

let currentMember = null;

let selectedTypes = [];
let selectedInventory = "all";
let selectedTeamPokemon = "all";

let searchQuery = "";

// = ÉTAT DU CHARGEMENT

let ctLoaded = false;
let pokemonLoaded = false;
let memberLoaded = false;

// = TEAM : COMPATIBILITÉS

let teamCTLoaded = false;
let compatibilityCacheBuilt = false;
let compatibilityCache = new Map();

// ==========================================================
// > UTILITAIRES
// ==========================================================

// = Normalisation

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// = Identifiants Pokédex

function normalizeDexId(value) {
  return String(value ?? "").replace(/^0+/, "");
}

// = Protection HTML

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

// = Recherche d'une espèce

function getSpecies(pokemon) {
  return speciesById.get(normalizeDexId(pokemon?.d)) ?? null;
}

// = Inventaire normalisé

function getInventoryNames() {
  const items = currentMember?.inventaire?.items ?? {};

  return new Set(Object.keys(items).map(normalize));
}

// ==========================================================
// > ÉQUIPE ET BOÎTE PC
// ==========================================================

// = Pokémon de l'équipe active

function getTeamPokemon() {
  const trainerCard = currentMember?.trainer_card;

  if (!trainerCard?.team || !trainerCard?.pokemon) return [];

  return trainerCard.team.map((id) => trainerCard.pokemon.find((pokemon) => String(pokemon.u) === String(id))).filter(Boolean);
}

// = Pokémon dans la boîte PC

function getBoxPokemon() {
  const trainerCard = currentMember?.trainer_card;

  if (!trainerCard?.team || !trainerCard?.pokemon) return [];

  const teamIds = new Set(trainerCard.team.map(String));

  return trainerCard.pokemon.filter((pokemon) => !teamIds.has(String(pokemon.u)));
}

// ==========================================================
// > RECHERCHE
// ==========================================================

function initSearch() {
  const input = document.querySelector(CT.searchInput);

  if (!input) return;

  input.addEventListener("input", () => {
    searchQuery = normalize(input.value);
    renderCT();
  });
}

// ==========================================================
// > INITIALISATION
// ==========================================================

async function initCT() {
  initSearch();
  initTeamButton();

  await Promise.all([initTypeFilter(), initInventoryFilter(), loadCT(), loadCurrentMember(), loadPokemon()]);

  // = Initialisation du filtre équipe après chargement des données

  await initTeamFilter();

  renderCT();
}

// ==========================================================
// > TEAM : BOUTON D'AFFICHAGE
// ==========================================================

function initTeamButton() {
  const button = document.querySelector(CT.teamButton);

  if (!button) return;

  button.disabled = true;

  button.addEventListener("click", () => {
    // = Vérification des données

    if (!ctLoaded || !pokemonLoaded || !memberLoaded) return;

    // = Calcul des compatibilités

    if (!compatibilityCacheBuilt) {
      buildCompatibilityCache();
    }

    // = Activation / désactivation

    teamCTLoaded = !teamCTLoaded;

    button.textContent = teamCTLoaded ? "Masquer les Pokémon compatibles" : "Charger les CT apprenables par mon équipe";

    button.classList.toggle("active", teamCTLoaded);

    renderCT();
  });

  updateTeamButton();
}

// = État du bouton

function updateTeamButton() {
  const button = document.querySelector(CT.teamButton);

  if (!button) return;

  button.disabled = !(ctLoaded && pokemonLoaded && memberLoaded);
}

// ==========================================================
// > RÉCUPÉRATION DES POKÉMON
// ==========================================================

async function loadPokemon() {
  try {
    const response = await fetch(POKEMON.url);

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    pokemonList = await response.json();

    // = Indexation des espèces par numéro Pokédex

    speciesById = new Map(pokemonList.map((species) => [normalizeDexId(species.id), species]));

    pokemonLoaded = true;

    renderTeam();
    renderBoxPokemon();
    renderCT();
  } catch (error) {
    console.error("[CT] Erreur de récupération des Pokémon :", error);
  } finally {
    updateTeamButton();
  }
}

// ==========================================================
// > MEMBRE CONNECTÉ
// ==========================================================

async function loadCurrentMember() {
  try {
    await MemberData.load();

    currentMember = MemberData.getCurrent();

    console.log("[CT] Membre connecté :", currentMember);

    memberLoaded = true;

    renderInventory();
    renderTeam();
    renderBoxPokemon();
    renderCT();

    return currentMember;
  } catch (error) {
    console.error("[CT] Erreur de récupération du membre :", error);
  } finally {
    updateTeamButton();
  }
}

// ==========================================================
// > FILTRE PAR TYPE
// ==========================================================

async function initTypeFilter() {
  await Dropdown.create({
    container: CT.typeFilter,

    type: "filter",
    mode: "multiple",

    placeholder: "Tous les types",
    searchPlaceholder: "Rechercher un type...",

    valueKey: "id",
    labelKey: "nom",
    searchKeys: ["nom"],

    options: CT.types.map((type) => ({
      id: type,
      nom: type,
    })),

    onChange(values) {
      selectedTypes = values;
      renderCT();
    },
  });
}

// ==========================================================
// > FILTRE PAR POSSESSION
// ==========================================================

async function initInventoryFilter() {
  await Dropdown.create({
    container: CT.inventoryFilter,

    type: "filter",
    mode: "single",

    placeholder: "Toutes les CT",

    valueKey: "id",
    labelKey: "nom",

    options: [
      { id: "all", nom: "Toutes les CT" },
      { id: "true", nom: "Possédées" },
      { id: "false", nom: "Non possédées" },
    ],

    defaultValue: "all",

    onChange(value) {
      selectedInventory = value;
      renderCT();
    },
  });
}

// ==========================================================
// > FILTRE PAR ÉQUIPE
// ==========================================================

async function initTeamFilter() {
  const team = getTeamPokemon();

  await Dropdown.create({
    container: CT.teamFilter,

    type: "filter",
    mode: "single",

    placeholder: "Toute l'équipe",

    valueKey: "id",
    labelKey: "nom",

    options: [
      { id: "all", nom: "Toute l'équipe" },

      ...team.map((pokemon) => {
        const species = getSpecies(pokemon);

        return {
          id: pokemon.u,
          nom: `${pokemon.n || "Sans surnom"} (${species?.nom ?? "Espèce inconnue"})`,
        };
      }),
    ],

    defaultValue: selectedTeamPokemon,

    onChange(value) {
      selectedTeamPokemon = value;

      // = Calcul des compatibilités si nécessaire

      if (value !== "all" && !compatibilityCacheBuilt) {
        buildCompatibilityCache();
      }

      renderCT();
    },
  });
}

// ==========================================================
// > RÉCUPÉRATION DES CT
// ==========================================================

async function loadCT() {
  try {
    const response = await fetch(CT.url);

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    ctList = await response.json();

    ctLoaded = true;

    renderInventory();
    renderCT();
  } catch (error) {
    console.error("[CT] Erreur de récupération :", error);

    if (CT.container) {
      CT.container.innerHTML = `
        <p class="ct-error">
          Impossible de charger les CT.
        </p>
      `;
    }
  } finally {
    updateTeamButton();
  }
}

// ==========================================================
// > TEAM : CALCUL DES COMPATIBILITÉS
// ==========================================================

function buildCompatibilityCache() {
  // = Préparation de l'équipe

  const team = [...getTeamPokemon(), ...getBoxPokemon()]
    .map((pokemon) => ({
      pokemon,
      species: getSpecies(pokemon),
      location: getTeamPokemon().some((teamPokemon) => String(teamPokemon.u) === String(pokemon.u)) ? "team" : "boitePC",
    }))
    .filter(({ species }) => species);

  // = Calcul des compatibilités pour chaque CT

  compatibilityCache = new Map();

  ctList.forEach((ct) => {
    const compatibleSpecies = new Set(
      String(ct.pokemon ?? "")
        .split(",")
        .map(normalize)
        .filter(Boolean),
    );

    const compatiblePokemon = team.filter(({ species }) => compatibleSpecies.has(normalize(species.nom)));

    compatibilityCache.set(ct, compatiblePokemon);
  });

  compatibilityCacheBuilt = true;

  console.log(`[CT] Compatibilités calculées : ${compatibilityCache.size} CT`);
}
// ==========================================================
// > FILTRAGE
// ==========================================================

function getFilteredCT(inventoryNames) {
  // = Compatibilités nécessaires au filtre équipe

  if (selectedTeamPokemon !== "all" && !compatibilityCacheBuilt) {
    buildCompatibilityCache();
  }

  return ctList.filter((ct) => {
    // = Type

    const matchesType = !selectedTypes.length || selectedTypes.some((type) => normalize(ct.type) === normalize(type));

    // = Recherche

    const matchesSearch = !searchQuery || [ct.nom, ct["nom en"]].some((name) => normalize(name).includes(searchQuery));

    // = Inventaire

    const hasCT = inventoryNames.has(normalize(ct.nom));

    const matchesInventory = selectedInventory === "all" || String(hasCT) === selectedInventory;

    // = Équipe : Pokémon sélectionné

    let matchesTeam = true;

    if (selectedTeamPokemon !== "all") {
      const compatiblePokemon = compatibilityCache.get(ct) ?? [];

      matchesTeam = compatiblePokemon.some(({ pokemon }) => String(pokemon.u) === String(selectedTeamPokemon));
    }

    return matchesType && matchesSearch && matchesInventory && matchesTeam;
  });
}

// ==========================================================
// > INVENTAIRE
// ==========================================================

function renderInventory() {
  const container = document.querySelector(".inventaire");

  if (!container) return;

  const items = currentMember?.inventaire?.items ?? {};

  // = CT disponibles dans l'inventaire

  const ctNames = new Set(ctList.map((ct) => normalize(ct.nom)));

  const availableCT = Object.entries(items).filter(([name]) => ctNames.has(normalize(name)));

  // = Affichage

  container.innerHTML = availableCT
    .map(
      ([name, quantity]) => `
        <div class="inventaire-item">
          <span>${escapeHTML(name)}</span>
          <b>${escapeHTML(quantity)}</b>
        </div>
      `,
    )
    .join("");
}

// ==========================================================
// > AFFICHAGE DE L'ÉQUIPE
// ==========================================================

function renderTeam() {
  const container = document.querySelector(".equipe-pokemon-list");

  if (!container) return;

  const team = getTeamPokemon();

  if (!team.length) {
    container.innerHTML = `<p>Aucune équipe disponible.</p>`;
    return;
  }

  // = Affichage

  container.innerHTML = team
    .map((pokemon) => {
      const species = getSpecies(pokemon);

      return `
        <div
          class="equipe-pokemon-item"
          data-pokemon-id="${escapeHTML(pokemon.u)}"
        >

          <img
            src="${escapeHTML(species?.sprite ?? "")}"
            alt="${escapeHTML(species?.nom ?? "Pokémon")}"
            loading="lazy"
          >

          <span class="equipe-pokemon-name">
            ${escapeHTML(pokemon.n || "Sans surnom")}
            <small>(${escapeHTML(species?.nom ?? "Espèce inconnue")})</small>
          </span>

        </div>
      `;
    })
    .join("");
}

// ==========================================================
// > AFFICHAGE DE LA BOÎTE PC
// ==========================================================

function renderBoxPokemon() {
  const container = document.querySelector(".boite-pc-list");

  if (!container) return;

  const pokemonList = getBoxPokemon();

  if (!pokemonList.length) {
    container.innerHTML = `<p>Aucun Pokémon dans la boîte PC.</p>`;
    return;
  }

  // = Affichage

  container.innerHTML = pokemonList
    .map((pokemon) => {
      const species = getSpecies(pokemon);

      return `
        <div
          class="boite-pc-item"
          data-pokemon-id="${escapeHTML(pokemon.u)}"
        >

          <img
            src="${escapeHTML(species?.sprite ?? "")}"
            alt="${escapeHTML(species?.nom ?? "Pokémon")}"
            loading="lazy"
          >

          <span class="boite-pc-name">
            ${escapeHTML(pokemon.n || "Sans surnom")}
            <small>(${escapeHTML(species?.nom ?? "Espèce inconnue")})</small>
          </span>

        </div>
      `;
    })
    .join("");
}

// ==========================================================
// > TEAM : POKÉMON AFFICHÉS PAR CT
// ==========================================================

function getUniqueCompatiblePokemon(ct, location) {
  const compatiblePokemon = compatibilityCache.get(ct) ?? [];

  const seenSpecies = new Set();

  return compatiblePokemon
    .filter(({ location: pokemonLocation }) => pokemonLocation === location)
    .filter(({ species }) => {
      const speciesId = normalizeDexId(species.id);

      if (seenSpecies.has(speciesId)) return false;

      seenSpecies.add(speciesId);

      return true;
    });
}
// ==========================================================
// > AFFICHAGE DES CT
// ==========================================================

function renderCT() {
  if (!CT.container) return;

  // = Inventaire

  const inventoryNames = getInventoryNames();

  // = Récupération des CT filtrées

  const filteredCT = getFilteredCT(inventoryNames);

  if (!filteredCT.length) {
    CT.container.innerHTML = `
      <p class="ct-empty">
        Aucune CT ne correspond à ta sélection.
      </p>
    `;
    return;
  }

  // = Affichage

  CT.container.innerHTML = filteredCT
    .map((ct) => {
      // > Possession de la CT

      const hasCT = inventoryNames.has(normalize(ct.nom));

      // > Pokémon compatibles

      const teamPokemon = teamCTLoaded ? getUniqueCompatiblePokemon(ct, "team") : [];
      const boxPokemon = teamCTLoaded ? getUniqueCompatiblePokemon(ct, "boitePC") : [];

      return `
        <article
          class="ct-item"
          data-ct-id="${escapeHTML(ct.id)}"
          data-inventaire="${hasCT}"
        >

          ${
            ct.img
              ? `
                <img
                  src="${escapeHTML(ct.img)}"
                  alt=""
                  loading="lazy"
                >
              `
              : ""
          }

          <img
            class="ct-item-tm"
            src="https://themis-trials.github.io/tools/assets/sprites/ct/${normalize(ct.type)}.png"
            alt="${escapeHTML(ct.type)}"
            loading="lazy"
          >

          <div class="ct-item-id">
            CT <b>${escapeHTML(ct.id)}</b>
          </div>

          <div
            class="ct-item-type type type_${normalize(ct.type)}"
            data-type="${normalize(ct.type)}"
          >
            ${escapeHTML(ct.type)}
          </div>

          <div class="ct-item-name">
            ${escapeHTML(ct.nom)}
          </div>

          <div class="ct-item-description">
            ${escapeHTML(ct.description)}
          </div>

<div class="ct-item-pokemon">

  <div class="team">
    ${teamPokemon
      .map(
        ({ pokemon, species }) => `
          <img
            src="${escapeHTML(species.sprite ?? "")}"
            alt="${escapeHTML(species.nom)}"
            title="${escapeHTML(pokemon.n || species.nom)}"
            loading="lazy"
            data-pokemon-id="${escapeHTML(pokemon.u)}"
          >
        `,
      )
      .join("")}
  </div>

  <div class="boitePC">
    ${boxPokemon
      .map(
        ({ pokemon, species }) => `
          <img
            src="${escapeHTML(species.sprite ?? "")}"
            alt="${escapeHTML(species.nom)}"
            title="${escapeHTML(pokemon.n || species.nom)}"
            loading="lazy"
            data-pokemon-id="${escapeHTML(pokemon.u)}"
          >
        `,
      )
      .join("")}
  </div>

</div>

        </article>
      `;
    })
    .join("");
}

// ==========================================================
// > LANCEMENT
// ==========================================================

initCT();
