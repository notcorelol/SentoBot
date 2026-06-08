import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = createEmbed({ title: "<:stats:1513123713711870083> Bot statistics", description: "Bot information\n**Name**: `Sento`\n**ID**: `1512738193932288030`\n **Created**: Saturday, June, 6th\n<a:developer:1513128854841982997> Developer: (c) `corelol.`\n<:github:1513133208210767892> Github: `notcorelol`" }).addFields(
        { name: "<:link:1513123238106890241> Servers", value: `${totalGuilds}`, inline: true },
        { name: "<:user:1513123331782738031> Users", value: `${totalMembers}`, inline: true },
        { name: "<:node:1513122426991415407> Node.js", value: `${nodeVersion}`, inline: true },
        { name: "<:discord:1513122602741403748> Discord.js", value: `v${version}`, inline: true },
        {
          name: "Memory",
          value: ``${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB``,
          inline: true,
        },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'System Error', description: 'Could not fetch system statistics.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};




