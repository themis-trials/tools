
import { Dropdown } from "https://themis-trials.github.io/tools/dropdown/dropdown.js";
import { MemberData } from "https://themis-trials.github.io/tools/outils/shared/members-data.js";

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

  types: [
    "Acier", "Combat", "Dragon", "Eau", "Électrik", "Fée",
    "Feu", "Glace", "Insecte", "Normal", "Plante", "Poison",
    "Psy", "Roche", "Sol", "Spectre", "Ténèbres", "Vol",
  ],
};

const POKEMON = {
  url: "https://opensheet.elk.sh/1MVWTjX6bKpFbxi9wcDWNlwmLTWL-P1wXSk-aHHpXhAY/Sheet1",
};

// = DONNÉES

let ctList = [];
let pokemonList = [];
let speciesById = new Map();

let currentMember = null;
let currentForumUser = null;

let selectedTypes = [];
let selectedInventory = "all";
let selectedTeamPokemon = "all";
let searchQuery = "";

// = ÉTAT DU CHARGEMENT

const loaded = {
  ct: false,
  pokemon: false,
  member: false,
};

// = COMPATIBILITÉS

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
    .replace(/[^a-z0-9]/g, "");
}

function normalizeDexId(value) {
  return String(value ?? "").replace(/^0+/, "");
}

// = Protection HTML

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

// = Recherche d'une espèce

function getSpecies(pokemon) {
  return speciesById.get(normalizeDexId(pokemon?.d)) ?? null;
}

// = Inventaire

function getInventoryNames() {
  const items = currentMember?.inventaire?.items ?? {};
  return new Set(Object.keys(items).map(normalize));
}

// = CT apprises

function hasLearnedCT(pokemon, ct) {
  return (pokemon.ct ?? []).some(
    (move) => normalize(move) === normalize(ct.nom),
  );
}

// = Chargement JSON

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erreur HTTP ${response.status} : ${url}`);
  }

  return response.json();
}

// ==========================================================
// > UTILISATEUR FORUMACTIF
// ==========================================================

// = Récupération des données depuis la page d'accueil

function getHomepageUserData() {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");

    iframe.src = "https://themistrials.forumactif.com/";
    iframe.style.display = "none";

    iframe.addEventListener("load", () => {
      try {
        const user = iframe.contentWindow._userdata;

        if (!user) {
          throw new Error("_userdata introuvable sur la page d'accueil.");
        }

        const data = {
          session_logged_in: user.session_logged_in,
          username: user.username,
          user_id: user.user_id,
          avatar_link: user.avatar_link,
          user_nb_privmsg: user.user_nb_privmsg,
          groupcolor: user.groupcolor,
        };

        iframe.remove();
        resolve(data);
      } catch (error) {
        iframe.remove();
        reject(error);
      }
    });

    iframe.addEventListener("error", () => {
      iframe.remove();
      reject(new Error("Impossible de charger la page d'accueil."));
    });

    document.body.appendChild(iframe);
  });
}

// ==========================================================
// > ÉQUIPE ET BOÎTE PC
// ==========================================================

// = Pokémon de l'équipe active

function getTeamPokemon() {
  const trainerCard = currentMember?.trainer_card;

  if (!trainerCard?.team || !trainerCard?.pokemon) return [];

  return trainerCard.team
    .map((id) =>
      trainerCard.pokemon.find(
        (pokemon) => String(pokemon.u) === String(id),
      ),
    )
    .filter(Boolean);
}

// = Pokémon dans la boîte PC

function getBoxPokemon() {
  const trainerCard = currentMember?.trainer_card;

  if (!trainerCard?.team || !trainerCard?.pokemon) return [];

  const teamIds = new Set(trainerCard.team.map(String));

  return trainerCard.pokemon.filter(
    (pokemon) => !teamIds.has(String(pokemon.u)),
  );
}

// = Tous les Pokémon avec leur emplacement

function getAllPokemonWithLocation() {
  const team = getTeamPokemon();
  const teamIds = new Set(team.map((pokemon) => String(pokemon.u)));

  return [...team, ...getBoxPokemon()]
    .map((pokemon) => ({
      pokemon,
      species: getSpecies(pokemon),
      location: teamIds.has(String(pokemon.u)) ? "team" : "boitePC",
    }))
    .filter(({ species }) => species);
}

// ==========================================================
// > INITIALISATION
// ==========================================================

async function initCT() {
  initSearch();
  initTeamButton();

  await Promise.all([
    initTypeFilter(),
    initInventoryFilter(),
    loadCT(),
    loadCurrentMember(),
    loadPokemon(),
  ]);

  buildCompatibilityCache();

  await initTeamFilter();

  renderAll();
}

// = Rafraîchissement général

function renderAll() {
  renderInventory();
  renderTeam();
  renderBoxPokemon();
  renderCT();
  updateTeamButton();
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
// > CHARGEMENT DES DONNÉES
// ==========================================================

// = CT

async function loadCT() {
  try {
    ctList = await fetchJSON(CT.url);
    loaded.ct = true;

    console.log("[CT] CT chargées :", ctList.length);
  } catch (error) {
    console.error("[CT] Erreur de récupération des CT :", error);

    if (CT.container) {
      CT.container.innerHTML = `
        <p class="ct-error">Impossible de charger les CT.</p>
      `;
    }
  } finally {
    updateTeamButton();
  }
}

// = Espèces Pokémon

async function loadPokemon() {
  try {
    pokemonList = await fetchJSON(POKEMON.url);

    speciesById = new Map(
      pokemonList.map((species) => [
        normalizeDexId(species.id),
        species,
      ]),
    );

    loaded.pokemon = true;

    console.log("[CT] Espèces chargées :", pokemonList.length);
  } catch (error) {
    console.error("[CT] Erreur de récupération des Pokémon :", error);
  } finally {
    updateTeamButton();
  }
}

// = Membre connecté

async function loadCurrentMember() {
  try {
    // Récupération de l'utilisateur depuis la page d'accueil

    currentForumUser = await getHomepageUserData();

    console.log("[CT] Utilisateur Forumactif :", currentForumUser);

    if (Number(currentForumUser.session_logged_in) !== 1) {
      throw new Error("Aucun membre connecté.");
    }

    // Chargement de la liste des membres

    await MemberData.load();

    // Recherche du membre correspondant à son identifiant

    currentMember = MemberData.getById(currentForumUser.user_id);

    if (!currentMember) {
      throw new Error(
        `Membre ${currentForumUser.user_id} introuvable dans MemberData.`,
      );
    }

    loaded.member = true;

    console.log("[CT] Membre chargé :", currentMember);
  } catch (error) {
    console.error("[CT] Erreur de récupération du membre :", error);
  } finally {
    updateTeamButton();
  }
}

// ==========================================================
// > FILTRES
// ==========================================================

// = Création d'un dropdown

async function createFilter(config) {
  return Dropdown.create({
    type: "filter",
    search: false,
    valueKey: "id",
    labelKey: "nom",
    ...config,
  });
}

// = Filtre par type

async function initTypeFilter() {
  await createFilter({
    container: CT.typeFilter,
    mode: "multiple",
    search: true,

    placeholder: "Tous les types",
    searchPlaceholder: "Rechercher un type...",

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

// = Filtre par possession

async function initInventoryFilter() {
  await createFilter({
    container: CT.inventoryFilter,
    mode: "single",

    placeholder: "Rechercher une CT",

    options: [
      { id: "all", nom: "Toutes les CT" },
      { id: "true", nom: "Possédées" },
      { id: "false", nom: "Non possédées" },
    ],

    onChange(value) {
      selectedInventory = value;
      renderCT();
    },
  });
}

// = Filtre par équipe et boîte PC

async function initTeamFilter() {
  const team = getTeamPokemon();
  const box = getBoxPokemon();

  const pokemonOptions = [...team, ...box].map((pokemon) => {
    const species = getSpecies(pokemon);

    return {
      id: pokemon.u,
      nom: `${pokemon.n || "Sans surnom"} (${species?.nom ?? "Espèce inconnue"})`,
    };
  });

  await createFilter({
    container: CT.teamFilter,
    mode: "single",

    placeholder: "Rechercher un Pokémon...",

    options: [
      { id: "all", nom: "Réinitialiser" },
      { id: "team", nom: "Toute l'équipe" },
      { id: "box", nom: "Toute la boîte PC" },
      { id: "teambox", nom: "Toute l'équipe + boîte PC" },
      ...pokemonOptions,
    ],

    onChange(value) {
      selectedTeamPokemon = value;

      if (!compatibilityCacheBuilt) {
        buildCompatibilityCache();
      }

      setTeamButtonState(value !== "all");
      renderCT();
    },
  });
}

// ==========================================================
// > BOUTON D'AFFICHAGE DES COMPATIBILITÉS
// ==========================================================

function initTeamButton() {
  const button = document.querySelector(CT.teamButton);

  if (!button) return;

  button.addEventListener("click", () => {
    if (!loaded.ct || !loaded.pokemon || !loaded.member) return;

    if (!compatibilityCacheBuilt) {
      buildCompatibilityCache();
    }

    setTeamButtonState(!teamCTLoaded);
    renderCT();
  });

  updateTeamButton();
}

// = Mise à jour de l'état du bouton

function updateTeamButton() {
  const button = document.querySelector(CT.teamButton);

  if (!button) return;

  button.disabled = !(
    loaded.ct &&
    loaded.pokemon &&
    loaded.member
  );
}

// = Synchronisation de l'état

function setTeamButtonState(value) {
  teamCTLoaded = value;

  const button = document.querySelector(CT.teamButton);

  if (button) {
    button.setAttribute("aria-pressed", String(value));
  }
}

// ==========================================================
// > CALCUL DES COMPATIBILITÉS
// ==========================================================

function buildCompatibilityCache() {
  if (!loaded.ct || !loaded.pokemon || !loaded.member) return;

  const pokemonWithLocation = getAllPokemonWithLocation();

  compatibilityCache = new Map();

  ctList.forEach((ct) => {
    const compatibleSpecies = new Set(
      String(ct.pokemon ?? "")
        .split(",")
        .map(normalize)
        .filter(Boolean),
    );

    const compatiblePokemon = pokemonWithLocation.filter(
      ({ species }) => compatibleSpecies.has(normalize(species.nom)),
    );

    compatibilityCache.set(ct, compatiblePokemon);
  });

  compatibilityCacheBuilt = true;

  console.log(
    `[CT] Compatibilités calculées : ${compatibilityCache.size} CT`,
  );
}

// = Pokémon compatibles avec une CT

function getCompatiblePokemon(ct, location = null) {
  const compatiblePokemon = compatibilityCache.get(ct) ?? [];

  if (!location) return compatiblePokemon;

  return compatiblePokemon.filter(
    ({ location: pokemonLocation }) => pokemonLocation === location,
  );
}

// ==========================================================
// > FILTRAGE DES CT
// ==========================================================

function getFilteredCT(inventoryNames) {
  if (
    loaded.ct &&
    loaded.pokemon &&
    loaded.member &&
    !compatibilityCacheBuilt
  ) {
    buildCompatibilityCache();
  }

  return ctList.filter((ct) => {
    // = Type

    const matchesType =
      !selectedTypes.length ||
      selectedTypes.some(
        (type) => normalize(ct.type) === normalize(type),
      );

    // = Recherche

    const matchesSearch =
      !searchQuery ||
      [ct.nom, ct["nom en"]].some(
        (name) => normalize(name).includes(searchQuery),
      );

    // = Possession

    const hasCT = inventoryNames.has(normalize(ct.nom));

    const matchesInventory =
      selectedInventory === "all" ||
      String(hasCT) === selectedInventory;

    // = Équipe et boîte PC

    const compatiblePokemon = compatibilityCache.get(ct) ?? [];

    let matchesTeam = true;

    if (selectedTeamPokemon === "team") {
      matchesTeam = compatiblePokemon.some(
        ({ location }) => location === "team",
      );
    } else if (selectedTeamPokemon === "box") {
      matchesTeam = compatiblePokemon.some(
        ({ location }) => location === "boitePC",
      );
    } else if (selectedTeamPokemon === "teambox") {
      matchesTeam = compatiblePokemon.length > 0;
    } else if (selectedTeamPokemon !== "all") {
      matchesTeam = compatiblePokemon.some(
        ({ pokemon }) =>
          String(pokemon.u) === String(selectedTeamPokemon),
      );
    }

    return (
      matchesType &&
      matchesSearch &&
      matchesInventory &&
      matchesTeam
    );
  });
}

// ==========================================================
// > AFFICHAGE DE L'INVENTAIRE
// ==========================================================

function renderInventory() {
  const container = document.querySelector(".inventaire");

  if (!container) return;

  const items = currentMember?.inventaire?.items ?? {};

  const ctNames = new Set(
    ctList.map((ct) => normalize(ct.nom)),
  );

  const availableCT = Object.entries(items).filter(
    ([name]) => ctNames.has(normalize(name)),
  );

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
// > AFFICHAGE DES POKÉMON
// ==========================================================

// = Génération d'un Pokémon

function createPokemonHTML(pokemon, classPrefix) {
  const species = getSpecies(pokemon);

  return `
    <div
      class="${classPrefix}-item"
      data-pokemon-id="${escapeHTML(pokemon.u)}"
    >
      <img
        src="${escapeHTML(species?.sprite ?? "")}"
        alt="${escapeHTML(species?.nom ?? "Pokémon")}"
        loading="lazy"
      >

      <span class="${classPrefix}-name">
        ${escapeHTML(pokemon.n || "Sans surnom")}
      </span>

      <span class="${classPrefix}-pkmn">
        (${escapeHTML(species?.nom ?? "Espèce inconnue")})
      </span>

      <span class="${classPrefix}-rang">
        rang ${escapeHTML(pokemon.r ?? "")}
      </span>
    </div>
  `;
}

// = Affichage d'une liste de Pokémon

function renderPokemonList(selector, pokemonList, classPrefix, emptyMessage) {
  const container = document.querySelector(selector);

  if (!container) return;

  if (!pokemonList.length) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = pokemonList
    .map((pokemon) => createPokemonHTML(pokemon, classPrefix))
    .join("");
}

// = Équipe

function renderTeam() {
  renderPokemonList(
    ".equipe-pokemon-list",
    getTeamPokemon(),
    "equipe-pokemon",
    "Aucune équipe disponible.",
  );
}

// = Boîte PC

function renderBoxPokemon() {
  renderPokemonList(
    ".boite-pc-list",
    getBoxPokemon(),
    "boite-pc",
    "Aucun Pokémon dans la boîte PC.",
  );
}

// ==========================================================
// > AFFICHAGE DES POKÉMON COMPATIBLES PAR CT
// ==========================================================

function renderCompatiblePokemon(ct, location, title) {
  const pokemon = getCompatiblePokemon(ct, location);

  if (!pokemon.length) return "";

  return `
    <div class="ct-item-${location === "team" ? "team" : "boitePC"}">
      <div class="ct-item-titre">${title}</div>

      <div class="ct-item-content">
        ${pokemon
          .map(
            ({ pokemon, species }) => `
              <img
                class="${hasLearnedCT(pokemon, ct) ? "ct-apprise" : ""}"
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
  `;
}

// ==========================================================
// > AFFICHAGE DES CT
// ==========================================================

function renderCT() {
  if (!CT.container) return;

  const inventoryNames = getInventoryNames();
  const filteredCT = getFilteredCT(inventoryNames);

  if (!filteredCT.length) {
    CT.container.innerHTML = `
      <p class="ct-empty">
        Aucune CT ne correspond à ta sélection.
      </p>
    `;
    return;
  }

  CT.container.innerHTML = filteredCT
    .map((ct) => {
      const hasCT = inventoryNames.has(normalize(ct.nom));

      const teamPokemon = teamCTLoaded
        ? renderCompatiblePokemon(ct, "team", "Équipe Pokémon")
        : "";

      const boxPokemon = teamCTLoaded
        ? renderCompatiblePokemon(ct, "boitePC", "Boîte PC")
        : "";

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

          ${
            teamPokemon || boxPokemon
              ? `
                <div class="ct-item-pokemon">
                  ${teamPokemon}
                  ${boxPokemon}
                </div>
              `
              : ""
          }

        </article>
      `;
    })
    .join("");
}

// ==========================================================
// > LANCEMENT
// ==========================================================

initCT();
