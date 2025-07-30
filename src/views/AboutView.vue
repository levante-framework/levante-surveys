<template>
  <div class="about">
    <div class="container">
      <h1>About Levante Survey Manager</h1>
      <p>This application provides tools for managing and creating surveys used in the Levante research platform.</p>

      <div class="features">
        <h2>Features</h2>
        <ul>
          <li>📊 Load and display surveys from Google Cloud Storage</li>
          <li>🎨 Visual survey creation with SurveyJS Creator</li>
          <li>🌍 Multi-language support (English, Spanish, German)</li>
          <li>📋 Survey preview and testing</li>
          <li>☁️ Cloud integration with Firebase projects</li>
        </ul>
      </div>

      <div class="tech-stack">
        <h2>Built With</h2>
        <ul>
          <li>Vue 3 + TypeScript</li>
          <li>PrimeVue UI Components</li>
          <li>SurveyJS Framework</li>
          <li>Pinia State Management</li>
          <li>Vite Build Tool</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  padding: 2rem;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.about h1 {
  color: #2c3e50;
  text-align: center;
  margin-bottom: 1.5rem;
}

.about p {
  font-size: 1.1rem;
  text-align: center;
  color: #666;
  margin-bottom: 2rem;
}

.features, .tech-stack {
  margin-bottom: 2rem;
}

.features h2, .tech-stack h2 {
  color: #34495e;
  border-bottom: 2px solid #3498db;
  padding-bottom: 0.5rem;
}

.features ul, .tech-stack ul {
  list-style: none;
  padding: 0;
}

.features li, .tech-stack li {
  padding: 0.5rem 0;
  color: #555;
  font-size: 1rem;
}

.features li:before, .tech-stack li:before {
  content: "▸ ";
  color: #3498db;
  font-weight: bold;
  margin-right: 0.5rem;
}

@media (max-width: 768px) {
  .about {
    padding: 1rem;
  }

  .container {
    padding: 1rem;
  }

  .about h1 {
    font-size: 1.8rem;
  }
}
</style>
