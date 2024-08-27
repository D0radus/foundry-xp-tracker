// hide xp from players
Hooks.on("renderActorSheet", (app, html) => {
    if (!game.user.isGM) {
        $(html).find(`input[name="system.details.xp.value"]`).closest('.exp-data').hide();
    }
});


let _calculatedXp = 0;
Object.defineProperty(window, 'calculatedXp', {
    get() {
        return _calculatedXp;
    },
    set(value) {
        _calculatedXp = value;
        updateXpDisplay(); // Call the function whenever calculatedXp is updated
    }
});

function updateXpDisplay() {
    // Ensure the element exists before trying to update it
    const xpTotalElement = document.querySelector('#xp-total');
    if (xpTotalElement) {
        xpTotalElement.textContent = calculatedXp;
    } else {
        console.error("Element #xp-total not found!");
    }
}

// fires when combat has ended
Hooks.on('preDeleteCombat', (combat) => {
    // Get the list of the opposition
    let info = calculateXp(combat, null);
    let xp = info.totalXP;
    let actors = combat.metrics.participants.opposition;

    // Create the HTML content for the dialog with images for each actor
    let content = `
        <form class="actor-selection">
            <div style="margin-bottom: 10px;">
                <strong>Total XP Earned: <span id="xp-total">${xp}</span></strong>
            </div>`;
    
    actors.forEach(actor => {
        content += `
            <div class="actor-image" data-actor-id="${actor.id}" style="display: inline-block; margin: 5px;">
                <img src="${actor.img}" alt="${actor.name}" title="${actor.name}" style="width: 100px; height: 100px; cursor: pointer; opacity: 1; border: 2px solid green;">
            </div>
        `;
    });
    
    content += `</form>`;
    
    // Create the dialog
    new Dialog({
        title: "Apply XP for Previous Combat?",
        content: content,
        buttons: {
            yes: {
                label: "Apply XP",
                callback: (html) => {
                    applyXp(combat);
                }
            },
            no: {
                label: "Skip XP",
                callback: () => console.log("Skipped applying XP")
            }
        },
        default: "no",
        render: (html) => {
            // Add click event listeners to toggle selection and update XP
            html.find('.actor-image').on('click', function() {
                let img = $(this).find('img');
                if ($(this).hasClass('selected')) {
                    $(this).removeClass('selected');
                    img.css('opacity', '0.5');
                    img.css('border', '2px solid red');
                } else {
                    $(this).addClass('selected');
                    img.css('opacity', '1');
                    img.css('border', '2px solid green');
                }
                let selectedActors = [];
                html.find('.actor-image.selected').each(function() {
                    selectedActors.push($(this).data('actor-id'));
                });
                calculateXp(combat, selectedActors)
            });

            // Mark all as selected by default
            html.find('.actor-image').addClass('selected');
        }
    }).render(true);
});

// Function to calculate total xp earned
function calculateXp(combat, selectedActors) {
    // calculate avearge party level
    let party = combat.metrics.participants.party.filter(actor => actor.type === 'character' && !actor.traits.has('eidolon') && !actor.traits.has('minion'));
    let totalLevel = party.reduce((sum, member) => sum + member.system.details.level.value, 0);
    let averageLevel = totalLevel / party.length;
    let opposition = [];
    if (selectedActors !== null) {
        combat.metrics.participants.opposition.forEach(opponent => {
            const actorId = opponent._id;
            const index = selectedActors.indexOf(actorId);
            if (index !== -1) {
                opposition.push(opponent);
                selectedActors.splice(index, 1);
            }
        });
    }
    else {
        opposition = combat.metrics.participants.opposition;
    }
    // get each level of the opposition, while filtering out unselected actors
    // enemy levels only include npcs
    let oppositionLevels = opposition.filter(opponent => opponent.type === 'npc')  
        .map(opponent => opponent.system.details.level.value);
    let hazards = opposition.filter(opponent => opponent.type === 'hazard');
    let info = game.pf2e.gm.calculateXP(averageLevel, party.length, oppositionLevels, hazards, {});
    calculatedXp = info.totalXP;
    return info;
}

function applyXp(combat) {
    // combat finished, distribute xp
    if (!game.user.isGM) return;
    // ensure that a valid combat occured
    if (combat.metrics == null) return;
    let recipients = combat.metrics.award.recipients.filter(e => e.type === 'character' && !e.traits.has('eidolon') && !e.traits.has('minion'));
    recipients.forEach(recipient => {
        // apply xp and check for a level up
        let actorUpdates = {};
        let currXp = recipient.system.details.xp.value;
        let newXp = currXp + calculatedXp;
        let remainderXp = recipient.system.details.xp.max - newXp;

        // create a chat message to notify the GM
        let message = `${recipient.name} has earned ${calculatedXp} xp.`;

        if (remainderXp <= 0) {
            // pc level up and apply remainder xp if any
            actorUpdates = { "system.details.level.value": recipient.system.details.level.value + 1, "system.details.xp.value": Math.abs(remainderXp) };
            message += ` ${recipient.name} has earned enough xp to level up and currently has ${Math.abs(remainderXp)} xp`;
        }
        else {
            actorUpdates = {
                "system.details.xp.value": newXp
            }
            message += ` ${recipient.name} currently has ${newXp} xp.`;
        }

        // Create a ChatMessage object
        let chatMessageData = {
            user: game.user.id, // The user sending the message (you can specify any user id or leave it as game.user.id to send as the currently logged-in user)
            content: message,
            type: CONST.CHAT_MESSAGE_TYPES.OOC, // Out Of Character message type
            whisper: [game.users.find(u => u.isGM).id], // Specify the GM as the recipient
        };
        recipient.update(actorUpdates);
        ChatMessage.create(chatMessageData);
    });
}


