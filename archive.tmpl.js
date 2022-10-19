export const layout = "layouts/archive.njk";

export default function*({ search, paginate }) {
    const posts = search.pages("type=posts", "date=desc");

    for (
        const data of paginate(posts, { url, size: 10 })
    ) {
        // Show the first page in the menu
        if (data.pagination.page === 1) {
            data.menu = {
                visible: false,
                order: 1,
            };
        }

        yield data;
    }
}

function url(n) {
    if (n === 1) {
        return "/";
    }

    return `/${n}/`;
}