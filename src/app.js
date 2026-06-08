import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildBans,
      ],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  // =========================
  // FIXED START (IMPORTANT)
  // =========================
  async start() {
    try {
      startupLog('Starting TitanBot');

      this.startWebServer();

      startupLog('Logging into Discord');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');

      // DO NOT BLOCK STARTUP
      setImmediate(() => this._initBackground());

      startupLog('TitanBot is online');

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  // =========================
  // BACKGROUND INITIALIZER
  // =========================
  _initBackground() {

    initializeDatabase()
      .then(dbInstance => {
        this.db = dbInstance.db;
        startupLog('Database initialized');
      })
      .catch(err => logger.error('DB error:', err));

    loadCommands(this)
      .then(() => {
        startupLog(`Commands loaded: ${this.commands.size}`);
      })
      .catch(err => logger.error('Command load error:', err));

    this.loadHandlers()
      .then(() => {
        startupLog('Handlers loaded');
      })
      .catch(err => logger.error('Handler load error:', err));

    setTimeout(() => {
      this.registerCommands()
        .then(() => startupLog('Slash commands registered'))
        .catch(err => logger.error('Slash command error:', err));
    }, 5000);

    setTimeout(() => {
      this.setupCronJobs();
      startupLog('Cron jobs started');
    }, 8000);
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const host = process.env.WEB_HOST || '0.0.0.0';

    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/ready', (req, res) => {
      res.status(200).json({ ready: true });
    });

    app.listen(configuredPort, host, () => {
      startupLog(`Web server running on ${host}:${configuredPort}`);
    });
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));
    cron.schedule('*/15 * * * *', () => this.updateAllCounters());
  }

  async updateAllCounters() {
    if (!this.db) return;

    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const validCounters = [];
        const orphanedCounters = [];

        for (const counter of counters) {
          if (counter && counter.channelId) {
            const channel = guild.channels.cache.get(counter.channelId);

            if (channel) {
              validCounters.push(counter);
              await updateCounter(this, guild, counter);
            } else {
              orphanedCounters.push(counter);
            }
          }
        }

        if (orphanedCounters.length > 0) {
          await saveServerCounters(this, guildId, validCounters);
        }
      } catch (error) {
        logger.error(`Counter update error for guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', required: true },
      { path: 'interactions', required: true },
    ];

    for (const handler of handlers) {
      try {
        const module = await import(`./handlers/${handler.path}.js`);
        const loader = module.default;

        if (typeof loader === 'function') {
          await loader(this);
        }
      } catch (error) {
        logger.error(`Handler load error: ${handler.path}`, error);
      }
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this);
    } catch (error) {
      logger.error('Slash command registration error:', error);
    }
  }

  async shutdown(reason = 'unknown') {
    logger.info(`Shutting down: ${reason}`);

    cron.getTasks().forEach(task => task.stop());

    if (this.db?.db?.pool) {
      await this.db.db.pool.end().catch(() => {});
    }

    this.destroy();
    process.exit(0);
  }
}

// =========================
// BOOTSTRAP
// =========================
const bot = new TitanBot();

process.on('SIGINT', () => bot.shutdown('SIGINT'));
process.on('SIGTERM', () => bot.shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error(err);
  bot.shutdown('uncaughtException');
});

process.on('unhandledRejection', (err) => {
  logger.error(err);
  bot.shutdown('unhandledRejection');
});

bot.start();

export default TitanBot;
