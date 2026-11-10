import { GITHUB_URL, PORTFOLIO_URL, TELEGRAM_URL } from "@/components/site/links";

/**
 * The words on /about and /contact, kept in one place so the HTML pages and
 * their Markdown versions (ADR-0024) can never say different things.
 */
export const ABOUT = {
  title: "About Armband",
  intro:
    "Armband is a free, open-source stats hub for Fantasy Premier League managers. It watches FPL's public data around the clock and turns it into tools you can use in seconds: season leaderboards, a fixture planner, tonight's price watch, player comparisons, a mini-league spy and your own team on the pitch with five checks. There is no sign-up and nothing to pay.",
  sections: [
    {
      heading: "How the numbers are made",
      body: "Every number on Armband is computed in code from Fantasy Premier League's public data and refreshed every few hours by an automated pipeline. Form, expected goal involvement per 90 minutes, minutes risk, fixture difficulty and captain scores are tested functions, not guesses. Anything about the future, such as fixture runs or price changes, is labelled an estimate every time.",
    },
    {
      heading: "Who builds it",
      body: "Armband is built and run by Abdelah Mohammed Aliy, an independent developer and FPL manager. It is not affiliated with, endorsed by or connected to the Premier League or Fantasy Premier League. The club kits shown on the pitch belong to their clubs.",
    },
    {
      heading: "Open source",
      body: "All of Armband is on GitHub under the MIT license: the website, the data pipeline and the insight engine. You can read how every number is calculated, run your own copy, or contribute an improvement.",
    },
  ],
  links: [
    { label: "Source code on GitHub", href: GITHUB_URL },
    { label: "Abdelah's portfolio", href: PORTFOLIO_URL },
  ],
} as const;

export const CONTACT = {
  title: "Contact",
  intro:
    "Armband is a one-person, open-source project, so the quickest way to reach us is in public, where answers help everyone. We read everything, and real bugs in the numbers are fixed first.",
  ways: [
    {
      heading: "Telegram",
      body: "Join the Armband Telegram channel for price changes, injury news and updates, and message us there with questions or ideas.",
      href: TELEGRAM_URL,
      label: "Open the Telegram channel",
    },
    {
      heading: "GitHub issues",
      body: "Found a wrong number, a broken page or something confusing? Open an issue on GitHub with the page address and what you expected to see. Feature ideas are welcome there too.",
      href: `${GITHUB_URL}/issues`,
      label: "Open an issue",
    },
    {
      heading: "Contributing",
      body: "Want to improve Armband yourself? The contributing guide explains how to run it locally, the rules the numbers follow, and how to send a pull request.",
      href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`,
      label: "Read the contributing guide",
    },
  ],
  note: "Armband never asks for your FPL password and cannot change your team. If anyone claiming to be Armband asks for it, it isn't us.",
} as const;
