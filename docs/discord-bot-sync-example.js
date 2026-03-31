/**
 * Discord Bot — Operation Attendance Sync Example
 *
 * This snippet demonstrates how to POST RSVP/attendance data
 * from a Discord bot to the 25th ID website backend whenever
 * a user reacts (accepts/declines) to an operation signup embed.
 *
 * Requirements:
 *   - discord.js v14+
 *   - node-fetch or axios
 *   - BACKEND_URL and DISCORD_SYNC_API_KEY environment variables
 *
 * Usage:
 *   Set these environment variables:
 *     BACKEND_URL=https://your-backend.example.com
 *     DISCORD_SYNC_API_KEY=your-secret-api-key
 *
 *   The same DISCORD_SYNC_API_KEY must be set in the backend .env file.
 */

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL; // e.g. https://api.25thid.example.com
const API_KEY = process.env.DISCORD_SYNC_API_KEY;

/**
 * Call this function whenever RSVP state changes for an operation.
 *
 * @param {object} operation - Operation metadata
 * @param {string} operation.messageId - The Discord message ID (used as external_id)
 * @param {string} operation.title - Operation title
 * @param {string} operation.description - Operation description / OPORD
 * @param {string} operation.startTime - ISO 8601 start time
 * @param {string} operation.endTime - ISO 8601 end time (optional)
 * @param {object} operation.createdBy - { discordId, name }
 * @param {Array} attendees - Array of { discordId, displayName, status }
 *   status: "accepted" | "declined" | "tentative"
 */
async function syncAttendanceToBackend(operation, attendees) {
  const payload = {
    operation: {
      external_id: operation.messageId,
      title: operation.title,
      description: operation.description || '',
      start_time: operation.startTime,
      end_time: operation.endTime || null,
      created_by: operation.createdBy
        ? { discord_id: operation.createdBy.discordId, name: operation.createdBy.name }
        : null,
    },
    attendance: attendees.map((a) => ({
      discord_id: a.discordId,
      display_name: a.displayName,
      status: a.status, // "accepted", "declined", or "tentative"
    })),
  };

  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/operations/sync-attendance`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': API_KEY,
        },
        timeout: 10000,
      }
    );
    console.log(`[Sync] ${response.data.status} operation ${response.data.operation_id} — ${response.data.attendees_count} attendees`);
  } catch (error) {
    console.error('[Sync] Failed to sync attendance:', error.response?.data || error.message);
  }
}

// ─── Example: Hook into Discord.js interaction handler ──────────────────────

/*
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // Example: your bot stores operation data in a Map or database
  const opData = operationsCache.get(interaction.message.id);
  if (!opData) return;

  // Handle accept/decline button
  if (interaction.customId === 'op_accept') {
    opData.attendees.set(interaction.user.id, {
      discordId: interaction.user.id,
      displayName: interaction.member?.displayName || interaction.user.username,
      status: 'accepted',
    });
  } else if (interaction.customId === 'op_decline') {
    opData.attendees.set(interaction.user.id, {
      discordId: interaction.user.id,
      displayName: interaction.member?.displayName || interaction.user.username,
      status: 'declined',
    });
  }

  // Sync to backend after every RSVP change
  await syncAttendanceToBackend(
    {
      messageId: interaction.message.id,
      title: opData.title,
      description: opData.description,
      startTime: opData.startTime,
      endTime: opData.endTime,
      createdBy: opData.createdBy,
    },
    Array.from(opData.attendees.values())
  );

  await interaction.deferUpdate();
});
*/

module.exports = { syncAttendanceToBackend };
