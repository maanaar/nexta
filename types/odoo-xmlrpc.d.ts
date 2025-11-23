declare module 'odoo-xmlrpc' {
  interface OdooConfig {
    url: string;
    db: string;
    username: string;
    password: string;
  }

  class Odoo {
    constructor(config: OdooConfig);
    connect(callback: (err: any, uid?: number) => void): void;
    execute_kw(
      model: string,
      method: string,
      args: any[],
      callback: (err: any, result?: any) => void
    ): void;
  }

  export = Odoo;
}

