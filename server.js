const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fetch = require('node-fetch');
const http = require('http');
require('dotenv').config();

// --- Render Compatibility (Health Check) ---
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(process.env.PORT || 8080);

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] 
});

let monitors = []; 

// --- Monitoring Logic with DM Notifications ---
setInterval(async () => {
    for (const mon of monitors) {
        try {
            const res = await fetch(mon.url);
            const isNowOnline = res.ok;
            const newStatus = isNowOnline ? '✅ Online' : '❌ Offline';

            // Check for status change to notify user
            if (mon.status !== '⏳ Checking...' && mon.status !== newStatus) {
                await notifyUser(mon, newStatus);
            }

            mon.status = newStatus;
        } catch (err) {
            if (mon.status !== '❌ Offline' && mon.status !== '⏳ Checking...') {
                await notifyUser(mon, '❌ Offline');
            }
            mon.status = '❌ Offline';
        }
    }
}, 15000);

async function notifyUser(monitor, newStatus) {
    try {
        const user = await client.users.fetch(monitor.userId);
        const embed = new EmbedBuilder()
            .setTitle('🚨 Monitor Alert')
            .setDescription(`Your website status has changed!`)
            .addFields(
                { name: 'URL', value: `\`${monitor.url}\`` },
                { name: 'New Status', value: `**${newStatus}**` }
            )
            .setColor(newStatus.includes('✅') ? 0x00FF00 : 0xFF0000)
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (err) {
        console.log(`Could not DM user ${monitor.userId}. They might have DMs off.`);
    }
}

// --- Interaction Handling ---
client.once('ready', async () => {
    console.log(`🚀 ${client.user.tag} is online!`);
    
    const commands = [
        new SlashCommandBuilder().setName('create').setDescription('Add a new URL to monitor')
            .addStringOption(opt => opt.setName('url').setDescription('The website URL').setRequired(true)),
        new SlashCommandBuilder().setName('list').setDescription('List your active monitors'),
        new SlashCommandBuilder().setName('delete').setDescription('Remove a monitor')
            .addStringOption(opt => opt.setName('id').setDescription('The Monitor ID').setRequired(true)),
        new SlashCommandBuilder().setName('help').setDescription('Show bot commands'),
        new SlashCommandBuilder().setName('admin-list').setDescription('List all (Admin)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('admin-clear').setDescription('Clear all (Admin)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'create') {
        const url = interaction.options.getString('url');
        const userMonitors = monitors.filter(m => m.userId === interaction.user.id);

        if (userMonitors.length >= 3) {
            return interaction.reply({ content: '⚠️ Limit reached (3 monitors max).', ephemeral: true });
        }

        const newMon = { 
            id: Math.random().toString(36).substr(2, 9), 
            userId: interaction.user.id, 
            url, 
            status: '⏳ Checking...' 
        };
        
        monitors.push(newMon);
        await interaction.reply({ 
            embeds: [new EmbedBuilder().setTitle('✅ Created').setDescription(`Monitoring **${url}**`).setColor(0x00FF00)] 
        });
    }

    if (interaction.commandName === 'list') {
        const myMons = monitors.filter(m => m.userId === interaction.user.id);
        if (myMons.length === 0) return interaction.reply('No active monitors.');

        const embed = new EmbedBuilder()
            .setTitle('📂 Your Monitors')
            .setColor(0x5865F2)
            .addFields(myMons.map(m => ({
                name: `ID: ${m.id}`,
                value: `Status: ${m.status}`
            })));

        await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'delete') {
        const id = interaction.options.getString('id');
        const initialLen = monitors.length;
        monitors = monitors.filter(m => !(m.id === id && m.userId === interaction.user.id));

        if (monitors.length === initialLen) return interaction.reply('❌ ID not found.');
        await interaction.reply('🗑️ Monitor removed.');
    }

    if (interaction.commandName === 'admin-list') {
        if (monitors.length === 0) return interaction.reply('Zero active monitors.');
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Admin: Global List')
            .addFields(monitors.map(m => ({ name: m.url, value: `User: <@${m.userId}>` })));
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'admin-clear') {
        monitors = [];
        await interaction.reply('🧹 Database cleared.');
    }

    if (interaction.commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Monitor Bot Help')
            .setColor(0xFFFF00)
            .addFields(
                { name: '/create [url]', value: 'Starts monitoring a site' },
                { name: '/list', value: 'Shows your monitors & status' },
                { name: '/delete [id]', value: 'Stops a specific monitor' }
            );
        await interaction.reply({ embeds: [helpEmbed] });
    }
});

client.login(process.env.TOKEN);
