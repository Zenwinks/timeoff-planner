<script setup>
// L'adresse où joindre le responsable du service.
const CONTACT_EMAIL = 'salle.lucas13@gmail.com'
</script>

<template>
  <div class="privacy">
    <div class="privacy-card">
      <h1>Vos données personnelles</h1>
      <p class="subtitle">
        TimeOff Planner est un service gratuit, tenu à titre personnel par Lucas.
        Il ne garde que ce qu'il faut pour calculer vos soldes de congés et de RTT.
      </p>

      <h2>Ce qui est gardé, et pourquoi</h2>
      <ul>
        <li>
          <strong>Votre adresse e-mail et votre identifiant Google</strong> : pour vous reconnaître
          quand vous vous connectez.
        </li>
        <li>
          <strong>Vos paramètres et les jours que vous posez</strong> (date, type, statut, durée) :
          c'est le service lui-même, ils servent à calculer vos soldes.
        </li>
        <li>
          <strong>La date de création du compte, celle de la dernière connexion et vos sessions</strong> :
          pour vous garder connecté 30 jours sur chaque appareil.
        </li>
      </ul>

      <h2>Ce qui n'est pas gardé</h2>
      <p>
        Ni votre nom, ni votre photo, ni votre mot de passe : la connexion passe par Google, qui ne
        transmet que votre adresse e-mail et votre identifiant. Aucune mesure d'audience, aucune
        publicité, aucun traceur.
      </p>

      <h2>Cookies</h2>
      <p>
        Un seul cookie, celui de votre session, indispensable pour rester connecté. Un second ne vit
        que quelques minutes, le temps de la connexion avec Google.
      </p>

      <h2>Où, et qui y accède</h2>
      <p>
        Sur un serveur loué chez OVHcloud. Seul Lucas, qui l'administre, y a accès. Rien n'est vendu
        ni partagé ; Google n'intervient qu'au moment de la connexion.
      </p>

      <h2>Combien de temps</h2>
      <p>
        Tant que votre compte existe. <strong>« Supprimer mon compte »</strong>, dans les Paramètres,
        efface aussitôt et définitivement votre compte et toutes vos données.
      </p>
      <p>
        Les copies de sauvegarde faites lors du changement d'hébergement, en octobre 2026, sont
        gardées en secours quelques mois au plus, puis effacées.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous voyez et modifiez toutes vos données dans l'app, et pouvez les effacer à tout moment.
        Pour toute question : <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>.
        Vous pouvez aussi vous adresser à la <a href="https://www.cnil.fr" rel="noopener">CNIL</a>.
      </p>

      <router-link to="/" class="back">← Retour</router-link>
    </div>
  </div>
</template>

<style scoped>
.privacy {
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.privacy-card {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 600px;
  font-size: 0.9rem;
  color: #ccc;
}

h1 {
  margin: 0 0 0.5rem;
  color: #efefef;
}

.subtitle {
  color: #888;
  margin-bottom: 1.5rem;
}

h2 {
  font-size: 0.95rem;
  font-weight: 600;
  color: #efefef;
  margin: 1.5rem 0 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #2a2a40;
}

p + p {
  margin-top: 0.5rem;
}

ul {
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

strong {
  color: #efefef;
  font-weight: 600;
}

.back {
  display: inline-block;
  margin-top: 2rem;
}

@media (max-width: 480px) {
  .privacy {
    padding: 1rem 0.5rem;
  }

  .privacy-card {
    padding: 1.25rem;
    border-radius: 10px;
  }

  h1 {
    font-size: 1.3rem;
  }
}
</style>
