function parseGroupData(groups) {
    return groups.map(group => ({
        name: group.querySelector('h3').innerText,
        link: group.querySelector('a').href
    }));
}

function extractGroupsFromDOM() {
    const groupElements = document.querySelectorAll('div[data-testid="group"]');
    return parseGroupData(groupElements);
}

export { parseGroupData, extractGroupsFromDOM };