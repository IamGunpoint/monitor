const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fetch = require('node-fetch');
const http = require('http');
require('dotenv').config();

// 1. WEB SERVER FOR RENDER (Keep-Alive)
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(process.env.PORT || 8080);

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] 
});

// In-memory Database
let monitors = []; 

// 2. MONITORING LOGIC (Every 15 Seconds)
setInterval(async () => {
    for (const mon of monitors) {
        try {
            const res = await fetch(mon.url, { timeout: 5000 });
            const isNowOnline = res.ok;
            const newStatus = isNowOnline ? '✅ Online' : '❌ Offline';

            // DM User on Status Change
            if (mon.status !== '⏳ Checking...' && mon.status !== newStatus) {
                try {
                    const user = await client.users.fetch(mon.userId);
                    const alertEmbed = new EmbedBuilder()
                        .setTitle('🚨 Status Alert')
                        .setColor(isNowOnline ? 0x00FF00 : 0xFF0000)
                        .addFields(
                            { name: 'Site', value: `\`${mon.url}\`` },
                            { name: 'New Status', value: newStatus }
                        )
                        .setTimestamp();
                    await user.send({ embeds: [alertEmbed] });
                } catch (e) { console.log("DM blocked by user."); }
            }
            mon.status = newStatus;
        } catch (err) {
            mon.status = '❌ Offline';
        }
    }
}, 15000);

// 3. COMMAND REGISTRATION & READY
client.once('ready', async () => {
    console.log(`🚀 Logged in as ${client.user.tag}`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('create')
            .setDescription('Add a new URL to monitor')
            .addStringOption(option => 
                option.setName('url')
                    .setDescription('The full URL (e.g., https://google.com)')
                    .setRequired(true)),
        
        new SlashCommandBuilder()
            .setName('list')
            .setDescription('List your active monitors'),
        
        new SlashCommandBuilder()
            .setName('delete')
            .setDescription('Remove a monitor')
            .addStringOption(option => 
                option.setName('id')
                    .setDescription('The Monitor ID from /list')
                    .setRequired(true)),

        new SlashCommandBuilder().setName('help').setDescription('Show all commands'),

        // Admin Commands
        new SlashCommandBuilder()
            .setName('admin-list')
            .setDescription('Admin: View all global monitors')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('admin-clear')
            .setDescription('Admin: Delete ALL monitors')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName('admin-remove')
            .setDescription('Admin: Force remove a monitor by ID')
            .addStringOption(option => option.setName('id').setDescription('Monitor ID').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    try {
        await client.application.commands.set(commands);
        console.log("✅ All commands registered successfully!");
    } catch (error) {
        console.error("❌ Error registering commands:", error);
    }
});

// 4. INTERACTION HANDLER
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'create') {
        const url = options.getString('url');
        const userCount = monitors.filter(m => m.userId === user.id).length;

        if (userCount >= 3) {
            return interaction.reply({ content: '🚫 Limit reached! You can only have 3 monitors.', ephemeral: true });
        }

        const newMon = {
            id: Math.floor(1000 + Math.random() * 9000).toString(), // Simple 4-digit ID
            userId: user.id,
            url: url,
            status: '⏳ Checking...'
        };

        monitors.push(newMon);
        const embed = new EmbedBuilder()
            .setTitle('✅ Monitor Created')
            .setDescription(`Started monitoring **${url}** every 15 seconds.`)
            .setColor(0x00FF00);
        
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'list') {
        const myMons = monitors.filter(m => m.userId === user.id);
        if (myMons.length === 0) return interaction.reply('❌ You have no active monitors.');

        const embed = new EmbedBuilder()
            .setTitle('📊 Your Monitors')
            .setColor(0x00AAFF)
            .addFields(myMons.map(m => ({
                name: `🆔 ID: ${m.id}`,
                value: `**Status:** ${m.status}\n**URL:** \`[PROTECTED]\``,
                inline: true
            })));

        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'delete') {
        const id = options.getString('id');
        const found = monitors.find(m => m.id === id && m.userId === user.id);

        if (!found) return interaction.reply({ content: '❌ Invalid ID or you do not own this monitor.', ephemeral: true });

        monitors = monitors.filter(m => m.id !== id);
        return interaction.reply(`🗑️ Monitor \`${id}\` has been deleted.`);
    }

    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Web Monitor Help')
            .setColor(0xFFFF00)
            .addFields(
                { name: 'User Commands', value: '`/create [url]` - Add monitor\n`/list` - Show your sites\n`/delete [id]` - Remove site' },
                { name: 'Admin Commands', value: '`/admin-list` - Show everything\n`/admin-remove [id]` - Delete any\n`/admin-clear` - Reset all' }
            )
            .setFooter({ text: 'Interval: 15 Seconds' });
        return interaction.reply({ embeds: [helpEmbed] });
    }

    // --- ADMIN LOGIC ---
    if (commandName === 'admin-list') {
        if (monitors.length === 0) return interaction.reply('Database empty.');
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Admin: Global List')
            .setColor(0xFF0000)
            .addFields(monitors.map(m => ({
                name: `ID: ${m.id} | User: ${m.userId}`,
                value: `URL: ${m.url} | Status: ${m.status}`
            })));
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'admin-remove') {
        const id = options.getString('id');
        monitors = monitors.filter(m => m.id !== id);
        return interaction.reply({ content: `🛡️ Admin force-removed \`${id}\`.`, ephemeral: true });
    }

    if (commandName === 'admin-clear') {
        monitors = [];
        return interaction.reply({ content: '🧹 Database wiped.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
