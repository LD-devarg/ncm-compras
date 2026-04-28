// ─────────────────────────────────────────────────────────────────────────────
// INTEGRACIÓN TELEGRAM
//
// Configurar en GAS → Project Settings → Script Properties:
//   TELEGRAM_BOT_TOKEN  →  token del bot (de @BotFather)
//   TELEGRAM_CHAT_ID    →  ID del grupo/canal (negativo para grupos, ej: -1001234567890)
//
// Para obtener el chat ID de un grupo:
//   1. Agregá el bot al grupo
//   2. Mandá cualquier mensaje en el grupo
//   3. Abrí: https://api.telegram.org/bot{TOKEN}/getUpdates
//   4. Buscá "chat":{"id": ...} en el resultado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía una notificación a Telegram cuando se crea una nueva solicitud.
 * No bloquea: si falla, loggea el error y retorna null.
 */
function notificarTelegramNuevaSolicitud(solicitudId, data) {
  try {
    const token  = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
    const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
      Logger.log('Telegram: faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Script Properties');
      return null;
    }

    // Formatear items
    const items = (data.items || [])
      .map((it, i) => `  ${i + 1}. ${it.unidades} × ${it.articulo}${it.descripcion ? ' — ' + it.descripcion : ''}`)
      .join('\n');

    const urgenciaEmoji = (data.urgencia || '').toLowerCase() === 'urgente' ? '🔴 URGENTE' : '🟡 Normal';

    const texto =
      `📋 *Nueva Solicitud de Compra*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 *ID:* \`${solicitudId}\`\n` +
      `👤 *Solicitante:* ${data.solicitante || '—'}\n` +
      `📁 *Proyecto:* ${data.proyecto || '—'}\n` +
      `📅 *Para cuándo:* ${data.paraCuando || '—'}\n` +
      `⚡ *Urgencia:* ${urgenciaEmoji}\n` +
      (data.proveedorSugerido ? `🏪 *Proveedor sugerido:* ${data.proveedorSugerido}\n` : '') +
      `\n*Artículos:*\n${items}`;

    const payload = {
      chat_id:    chatId,
      text:       texto,
      parse_mode: 'Markdown'
    };

    const resp = UrlFetchApp.fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:      'post',
        contentType: 'application/json',
        payload:     JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const result = JSON.parse(resp.getContentText());
    if (!result.ok) {
      Logger.log('Telegram error: ' + resp.getContentText());
    } else {
      Logger.log('Telegram: notificación enviada para ' + solicitudId);
    }
    return result;
  } catch (e) {
    Logger.log('Telegram: excepción — ' + e.message);
    return null;
  }
}

/**
 * Función de prueba: ejecutar manualmente desde el editor de GAS
 * para verificar que el bot y el chat ID estén bien configurados.
 */
function testTelegram() {
  const token  = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');

  if (!token || !chatId) {
    Logger.log('Faltan Script Properties: TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID');
    return;
  }

  const resp = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify({
        chat_id:    chatId,
        text:       '✅ Bot de NCM Compras configurado correctamente.',
        parse_mode: 'Markdown'
      }),
      muteHttpExceptions: true
    }
  );

  Logger.log('Telegram test: ' + resp.getContentText());
}
