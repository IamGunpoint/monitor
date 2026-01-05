const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');
const fetch = require('node-fetch');
const http = require('http');
require('dotenv').config();

// 1. WEB SERVER
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(process.env.PORT || 8080);

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] 
});

let monitors = []; 
const FOOTER_TEXT = "Made by IamAman • Monitoring every 15s";

// 2. MONITORING LOGIC
setInterval(async () => {
    for (const mon of monitors) {
        try {
            const res = await fetch(mon.url, { timeout: 5000 });
            const newStatus = res.ok ? '✅ Online' : '❌ Offline';

            if (mon.status !== '⏳ Checking...' && mon.status !== newStatus) {
                const user = await client.users.fetch(mon.userId).catch(() => null);
                if (user) {
                    const alert = new EmbedBuilder()
                        .setTitle('🚨 Status Change')
                        .setColor(res.ok ? 0x00FF00 : 0xFF0000)
                        .addFields({ name: 'Site', value: `\`${mon.url}\`` }, { name: 'Status', value: newStatus })
                        .setFooter({ text: FOOTER_TEXT });
                    user.send({ embeds: [alert] }).catch(() => null);
                }
            }
            mon.status = newStatus;
        } catch (err) {
            mon.status = '❌ Offline';
        }
    }
}, 15000);

// 3. FORCE REGISTER COMMANDS
client.once('ready', async () => {
    console.log(`🚀 Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('create').setDescription('Add a new URL to monitor')
            .addStringOption(opt => opt.setName('url').setDescription('Enter full URL').setRequired(true)),
        new SlashCommandBuilder().setName('list').setDescription('Show your monitors'),
        new SlashCommandBuilder().setName('delete').setDescription('Remove a monitor')
            .addStringOption(opt => opt.setName('id').setDescription('The ID from /list').setRequired(true)),
        new SlashCommandBuilder().setName('help').setDescription('View commands'),
        new SlashCommandBuilder().setName('admin-list').setDescription('View all').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('admin-clear').setDescription('Clear all').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('admin-remove').setDescription('Remove by ID').addStringOption(o => o.setName('id').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    try {
        await client.application.commands.set(commands);
        console.log("✅ Slash Commands Refreshed Globally!");
    } catch (e) { console.error(e); }
});

// 4. COMMAND HANDLER
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'create') {
        const url = interaction.options.getString('url');
        if (monitors.filter(m => m.userId === interaction.user.id).length >= 3) {
            return interaction.reply({ content: '🚫 Limit: 3 monitors.', ephemeral: true });
        }

        const newMon = { id: Math.floor(1000 + Math.random() * 9000).toString(), userId: interaction.user.id, url, status: '⏳ Checking...' };
        monitors.push(newMon);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Created new monitor')
            .setDescription(`Now watching: \`${url}\``)
            .setColor(0x00FF00)
            .setFooter({ text: FOOTER_TEXT });
        return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'list') {
        const my = monitors.filter(m => m.userId === interaction.user.id);
        if (my.length === 0) return interaction.reply('No monitors found.');

        const embed = new EmbedBuilder()
            .setTitle('📊 Your Monitors')
            .setColor(0x0099FF)
            .setFooter({ text: FOOTER_TEXT })
            .addFields(my.map(m => ({ name: `🆔 ID: ${m.id}`, value: `**Status:** ${m.status}\n**URL:** \`PROTECTED\``, inline: true })));
        return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'delete') {
        const id = interaction.options.getString('id');
        const found = monitors.find(m => m.id === id && m.userId === interaction.user.id);
        if (!found) return interaction.reply('❌ Invalid ID.');
        monitors = monitors.filter(m => m.id !== id);
        return interaction.reply(`🗑️ Deleted monitor \`${id}\`. Made by IamAman`);
    }

    if (interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Web Monitor Help')
            .setColor(0xFFFF00)
            .setFooter({ text: FOOTER_TEXT })
            .addFields(
                { name: 'User', value: '`/create`, `/list`, `/delete`' },
                { name: 'Admin', value: '`/admin-list`, `/admin-remove`, `/admin-clear`' }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // Admin Handlers
    if (interaction.commandName === 'admin-list') {
        const embed = new EmbedBuilder().setTitle('🛡️ Admin List').setFooter({ text: FOOTER_TEXT });
        if (monitors.length === 0) return interaction.reply('Empty.');
        embed.addFields(monitors.map(m => ({ name: m.url, value: `ID: ${m.id} | User: <@${m.userId}>` })));
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'admin-clear') {
        monitors = [];
        return interaction.reply('🧹 All monitors cleared. Made by IamAman');
    }
});

client.login(process.env.TOKEN);
