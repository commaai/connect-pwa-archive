# comma connect

The frontend to the comma connect progressive web app. This a react app using [Create React App](https://github.com/facebookincubator/create-react-app)

## Environments
 * Development (local machine) http://localhost:5173
 * Staging (docker)
   * packages/images are build by CI, and put on staging branch
 * Production (docker) https://connect.comma.ai
   * pushed manually

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `react-router-redux` - the newer one, 5.x.... Mindlessly simple routing with convenient global access due to redux

## Development
`pnpm start`

## Contributing

 * Use best practices
 * Write test cases
 * Keep files small and clean
 * Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up
