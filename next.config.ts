import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El cliente de Google Calendar arrastra dependencias que no se empaquetan bien
  // en el bundle serverless; se dejan como externas al runtime de Node.
  serverExternalPackages: ['@googleapis/calendar', 'google-auth-library'],
  // Túneles usados para exponer el dev server a Vapi/Twilio durante pruebas.
  allowedDevOrigins: ['*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.app', '*.ngrok.io'],
};

export default nextConfig;
