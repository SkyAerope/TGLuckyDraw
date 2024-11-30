# TGLuckyDraw
随机频道消息？

## 如何使用？
    ### 1. 克隆仓库并安装依赖
    ```bash
    mv .env.example .env
    pnpm i
    ```
    ### 2. 运行`TGLogin.js`文件，按照提示登录，获取`SessionString`，放入.env文件中
    ```bash
    node TGLogin.js
    ```
    ### 3. 构建并运行
    ```bash
    npm run build
    npm run dev
    ```

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |
