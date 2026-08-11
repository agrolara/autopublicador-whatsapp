import fs from 'fs';
import path from 'path';

/**
 * Script para automatizar envíos masivos cada 12 horas en OpenWA.
 * Puede ejecutarse directamente con `node scripts/schedule-broadcast.js`
 */

const SESSION_ID = '4f9deec9-0dfe-4ad8-be5e-a4eb186a77be';
const API_URL = 'http://localhost:2785/api/sessions/' + SESSION_ID + '/messages/send-bulk';

// Cargar API Key si existe
let apiKey = '';
try {
  apiKey = fs.readFileSync(path.join(process.cwd(), 'data', '.api-key'), 'utf8').trim();
} catch (e) {
  // Ignorar si no requiere autenticación local
}

export async function send12HourBroadcast(payload) {
  console.log(`[${new Date().toLocaleString()}] 🚀 Iniciando envío masivo a ${payload.recipients.length} grupos...`);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log(`[${new Date().toLocaleString()}] ✅ Envío masivo programado con éxito. Respuesta:`, data);
    return data;
  } catch (err) {
    console.error(`[${new Date().toLocaleString()}] ❌ Error en el envío masivo:`, err.message);
    throw err;
  }
}
