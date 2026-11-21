/* ==========================================================
   THEMIS — MEMBER DATA
========================================================== */

export const MemberData = {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  url: "https://7gr.sixtine-rpg.fr/themis-trials/dashboard-admin/memberlist/membres.php",

  members: [],
  current: null,
  loaded: false,

  // ==========================================================
  // > RÉCUPÉRATION
  // ==========================================================

  async load(force = false) {
    // = Utiliser les données déjà récupérées.

    if (this.loaded && !force) {
      return this.members;
    }

    try {
      const response = await fetch(this.url);

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const json = await response.json();

      // = Normaliser les données.

      this.members = Array.isArray(json) ? json : (json.members ?? json.posts ?? []);

      this.loaded = true;

      // = Identifier le membre connecté.

      this.current = this.getCurrent();

      console.log("[THEMIS] Membres chargés :", this.members);
      console.log("[THEMIS] Membre connecté :", this.current);

      return this.members;
    } catch (error) {
      console.error("[THEMIS] Erreur de récupération des membres :", error);

      return [];
    }
  },

  // ==========================================================
  // > MEMBRE CONNECTÉ
  // ==========================================================

  getCurrent() {
    const user = window._userdata;

    if (!user) return null;

    return this.members.find((member) => Number(member.user_id) === Number(user.user_id) && member.username?.trim().toLowerCase() === user.username?.trim().toLowerCase()) ?? null;
  },

  // ==========================================================
  // > RECHERCHE PAR ID
  // ==========================================================

  getById(id) {
    return this.members.find((member) => Number(member.user_id) === Number(id)) ?? null;
  },

  // ==========================================================
  // > RECHERCHE PAR NOM
  // ==========================================================

  getByUsername(username) {
    return this.members.find((member) => member.username?.trim().toLowerCase() === username?.trim().toLowerCase()) ?? null;
  },

  // ==========================================================
  // > RÉCUPÉRATION D'UNE INFORMATION
  // ==========================================================

  get(key) {
    return this.current?.[key] ?? null;
  },
};
