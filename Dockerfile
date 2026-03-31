# Usa una imagen oficial de Node.js (LTS)
FROM node:22-slim

# Instala curl para health checks opcionales (o firebase-tools si fuera necesario)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /app

# Copia solo archivos de dependencias para aprovechar la caché de capas
COPY package*.json ./

# Instala dependencias (incluyendo dev para compilar)
RUN npm install

# Copia el resto del código
COPY . .

# Compila el código TypeScript a JavaScript
RUN npm run build

# Elimina dependencias de desarrollo para ahorrar espacio (Opcional pero recomendado)
# RUN npm prune --production

# Puerto expuesto (Cloud Run usa la variable PORT por defecto)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
