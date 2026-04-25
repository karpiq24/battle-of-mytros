/**
 * Chat card rendering for battle results.
 */

export async function _postChatCard(statsCopy, statusData, deathsThisBattle) {
    const winner = this.battleState.overallWinner;

    const signedStr = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const injClass = (n) => (n > 0 ? "text-bad" : n < 0 ? "text-good" : "text-neutral");
    const morClass = (n) => (n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-neutral");

    const aRec = this.battleState.recoveryResult?.allied;
    const sRec = this.battleState.recoveryResult?.sydon;
    const aHope = this.battleState.hopeResult?.allied;
    const sHope = this.battleState.hopeResult?.sydon;
    const aCmdr = this.battleState.commanderResult?.allied;
    const sCmdr = this.battleState.commanderResult?.sydon;

    const cardData = {
        sectionName: this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
        alliedName: this.battleState.allied.name,
        sydonName: this.battleState.sydon.name,
        winnerLabel: winner === "allied" ? this.battleState.allied.name : this.battleState.sydon.name,
        scoreAllied: this.battleState.counter.allied,
        scoreSydon: this.battleState.counter.sydon,
        alliedRecoveryText: aRec
            ? aRec.success
                ? aRec.injuries === 0
                    ? "No injury"
                    : signedStr(aRec.injuries)
                : `${signedStr(aRec.injuries)} (failed)`
            : "—",
        alliedRecoveryClass: aRec ? injClass(aRec.injuries) : "",
        alliedRecoveryRoll: aRec ? `${aRec.rollTotal} vs DC ${aRec.dc}` : "",
        alliedRecoveryMods: aRec?.modSummary || [],
        sydonRecoveryText: sRec
            ? sRec.success
                ? sRec.injuries === 0
                    ? "No injury"
                    : signedStr(sRec.injuries)
                : `${signedStr(sRec.injuries)} (failed)`
            : "—",
        sydonRecoveryClass: sRec ? injClass(sRec.injuries) : "",
        sydonRecoveryRoll: sRec ? `${sRec.rollTotal} vs DC ${sRec.dc}` : "",
        sydonRecoveryMods: sRec?.modSummary || [],
        alliedHopeText: aHope ? `${signedStr(aHope.moraleDelta)} Morale` : "—",
        alliedHopeClass: aHope ? morClass(aHope.moraleDelta) : "",
        alliedHopeRoll: aHope
            ? `${aHope.rollTotal} vs DC ${game.settings.get("battle-of-mytros", "hopeDC") ?? 12}`
            : "",
        alliedHopeMods: aHope?.modSummary || [],
        sydonHopeText: sHope ? `${signedStr(sHope.moraleDelta)} Morale` : "—",
        sydonHopeClass: sHope ? morClass(sHope.moraleDelta) : "",
        sydonHopeRoll: sHope ? `${sHope.rollTotal} vs DC ${game.settings.get("battle-of-mytros", "hopeDC") ?? 12}` : "",
        sydonHopeMods: sHope?.modSummary || [],
        alliedInjuries: statsCopy.allied.injuries,
        alliedMorale: statsCopy.allied.morale,
        sydonInjuries: statsCopy.sydon.injuries,
        sydonMorale: statsCopy.sydon.morale,
        alliedCommanderDied: aCmdr?.died ?? false,
        alliedCommanderName: aCmdr?.commanderName ?? "",
        sydonCommanderDied: sCmdr?.died ?? false,
        sydonCommanderName: sCmdr?.commanderName ?? "",
        alliedStatus: statusData.allied?.text ?? "",
        alliedStatusType: statusData.allied?.type ?? "",
        sydonStatus: statusData.sydon?.text ?? "",
        sydonStatusType: statusData.sydon?.type ?? "",
        deathToll: deathsThisBattle,
    };

    const html = await foundry.applications.handlebars.renderTemplate(
        "modules/battle-of-mytros/templates/chat-card.hbs",
        cardData
    );
    await ChatMessage.create({ content: html, speaker: { alias: game.i18n.localize("MYTROS.SpeakerAlias") } });
}
