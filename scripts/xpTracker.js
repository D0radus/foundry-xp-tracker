// hide xp from players
Hooks.on("renderActorSheet", (app, html) => {
    if (!game.user.isGM) {
        $(html).find(`input[name="system.details.xp.value"]`).closest('.exp-data').hide();
    }
});

// fires when combat has ended
Hooks.on('preDeleteCombat', (combat) => {
    Dialog.confirm({
        title: "Apply XP for Previous Combat?",
        yes: () => applyXp(combat),
        no: () => console.log("Skipped applying xp"),
        defaultYes: false
    });
});
function applyXp(combat) {
    // combat finished, distribute xp
    if (!game.user.isGM) return;
    // ensure that a valid combat occured
    if (combat.metrics == null) return;

    let actors = game.actors.filter(e => e.type === 'character' && !e.traits.has('eidolon') && !e.traits.has('minion'));
    const xp = combat.metrics.award.xp;

    actors.forEach(actor => {
        // apply xp and check for a level up
        let actorUpdates = {};
        let currXp = actor.system.details.xp.value;
        let newXp = currXp + xp;
        let remainderXp = actor.system.details.xp.max - newXp;

        // create a chat message to notify the GM
        let message = `${actor.name} has earned ${xp} xp.`;

        if (remainderXp <= 0) {
            // pc level up and apply remainder xp if any
            actorUpdates = { "system.details.level.value": actor.system.details.level.value + 1, "system.details.xp.value": Math.abs(remainderXp) };
            message += ` ${actor.name} has earned enough xp to level up and currently has ${Math.abs(remainderXp)} xp`;
        }
        else {
            actorUpdates = {
                "system.details.xp.value": newXp
            }
            message += ` ${actor.name} currently has ${newXp} xp.`;
        }

        // Create a ChatMessage object
        let chatMessageData = {
            user: game.user.id, // The user sending the message (you can specify any user id or leave it as game.user.id to send as the currently logged-in user)
            content: message,
            type: CONST.CHAT_MESSAGE_TYPES.OOC, // Out Of Character message type
            whisper: [game.users.find(u => u.isGM).id], // Specify the GM as the recipient
        };
        actor.update(actorUpdates);
        ChatMessage.create(chatMessageData);
    });
}


