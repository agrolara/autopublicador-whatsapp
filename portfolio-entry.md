---
title: "OpenWA AI Gateway: Plataforma Autónoma de WhatsApp con Inteligencia Artificial y Multi-Sesión"
slug: "openwa-ai-whatsapp-gateway"
description: "Plataforma empresarial de automatización de WhatsApp con soporte multi-sesión, integración de modelos de lenguaje avanzados (OpenRouter, Gemini, OpenAI), transcripción de notas de voz, respuestas divididas inteligentes y panel de control web en tiempo real."
publishedAt: "2026-09-08"
author: "AgroLara Development Team"
featured: true
category: "Automatización & Inteligencia Artificial"
tags:
  - "WhatsApp API"
  - "NestJS"
  - "React"
  - "Vite"
  - "OpenRouter"
  - "Whisper AI"
  - "Docker"
  - "Coolify"
  - "TypeScript"
repository: "https://github.com/agrolara/autopublicador-whatsapp"
liveDemo: "https://whatsapp-autopublicaciones.agrolara.dedyn.io"
---

# 🤖 OpenWA AI Gateway: Automatización de WhatsApp con IA

## 🌟 Resumen Ejecutivo

**OpenWA AI Gateway** es una solución integral y auto-hospedada (*self-hosted*) que convierte cualquier cuenta de WhatsApp en un canal automatizado de ventas, atención al cliente y soporte 24/7. Integra agentes de Inteligencia Artificial capaces de mantener conversaciones contextuales en lenguaje natural, transcribir notas de voz recibidas, consultar bases de conocimiento documentales (PDF, Word, CSV) y derivar automáticamente a operadores humanos cuando la situación lo requiere.

---

## 🎯 Problemas que Resuelve

1. **Saturación en canales de atención**: Respuesta inmediata sin demoras a cientos de clientes simultáneos.
2. **Mensajes largos truncados o abrumadores**: División semántica de respuestas extensas en varios mensajes naturales con simulación de escritura (*typing indicator*).
3. **Pérdida de ventas fuera de horario laboral**: Capacidad de responder preguntas frecuentes, catálogo de servicios y cotizaciones en tiempo real las 24 horas del día.
4. **Barrera de las notas de voz**: Transcripción instantánea de notas de voz de clientes para que el agente de IA las comprenda y responda de inmediato.
5. **Transición fluida a humanos**: Derivación automática con alerta directa al WhatsApp personal del operador ante intenciones complejas o solicitud explícita del cliente.

---

## 🚀 Características Principales

### 🧠 1. Asistente de IA Autónomo y Multi-Proveedor
* **Soporte de Modelos**: Compatibilidad nativa con **OpenRouter** (`NVIDIA Nemotron`, `Google Gemma`, `Meta Llama 3.3 70B`), **Google Gemini** y **OpenAI**.
* **Respuestas Divididas Inteligentes**: Algoritmo que respeta párrafos y signos de puntuación, dividiendo catálogos o respuestas largas en bloques legibles de 750 caracteres enviados con intervalo natural.
* **Gestión de Pensamiento Interno**: Filtrado automático de trazas de razonamiento (`<thought>`, `Thinking Process:`) para entregar solo respuestas comerciales limpias.
* **Base de Conocimiento Empresarial**: Carga de archivos PDF, DOCX, TXT y CSV que alimentan la memoria del bot con información oficial del negocio.

### 🎙️ 2. Transcripción de Audio en Tiempo Real
* Integración con **Groq Whisper** y **OpenAI Whisper** para transcribir audios de voz en milisegundos con alta precisión y puntuación automática.

### 👥 3. Derivación a Humano y Silenciamiento Inteligente
* **Detección de Intervención Humana**: Si un operador responde desde su teléfono, el bot guarda silencio automáticamente por un tiempo configurable.
* **Alerta Instantánea a Operador**: Notificación automática al WhatsApp del encargado ante pedidos especiales o solicitudes de contacto.
* **Comandos Rápidos**: Activación y desactivación inmediata del asistente mediante comandos como `#ia` o `#reactivar`.

### 📊 4. Panel de Control Web Centralizado (Dashboard)
* **Gestión Multi-Sesión**: Conexión simultánea de múltiples números de WhatsApp mediante código QR en pantalla.
* **Bandeja de Entrada Unificada**: Chat web en tiempo real con soporte para texto, imágenes, audios y documentos.
* **Difusiones y Programación**: Envío de campañas masivas con control de cadencia (*anti-ban pacing*) y programación de fechas.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Backend** | **NestJS 10 (Node.js 22)** | Arquitectura modular escalable, inyección de dependencias y WebSockets. |
| **Motor WhatsApp** | **Baileys (WebSockets) & WWebJS** | Conexión directa y eficiente al protocolo de WhatsApp sin consumo excesivo de RAM. |
| **Frontend** | **React 18 + Vite 8** | Panel de administración reactivo y ultra rápido con Tailwind CSS. |
| **Base de Datos** | **SQLite & PostgreSQL (TypeORM)** | Persistencia local ligera con sincronización transaccional. |
| **Inteligencia Artificial** | **OpenRouter, Gemini, Whisper** | LLMs de última generación y transcripción de voz multimodal. |
| **Infraestructura** | **Docker & Coolify PaaS** | Despliegue continuo con contenedor multi-stage, usuario no-root y healthchecks. |
| **Multimedia** | **FFmpeg & Sharp** | Transcodificación de audio Ogg/Opus para notas de voz y compresión de imágenes. |

---

## 📈 Impacto y Métricas Clave

* ⚡ **Tiempo de Respuesta Promedio**: Menor a 2.5 segundos por interacción.
* 🕒 **Disponibilidad**: 99.9% de operatividad en VPS mediante reinicios automáticos de salud (*Healthcheck*).
* 💰 **Optimización de Costos**: Integración con modelos de alto rendimiento y bajo costo (o nivel gratuito) de OpenRouter.
* 📦 **Memoria Controlada**: Operación eficiente de múltiples sesiones con motor Baileys consumiendo menos de 450 MB de RAM.
