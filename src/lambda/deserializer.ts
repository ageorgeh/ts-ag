// async function deserialize(data: string, env: string | 'production'): Promise<any> {
//   if (env === 'production') {
//     const { parse: prodParse } = await import('@ungap/structured-clone/json');
//     return prodParse(data);
//   } else {
//     const cycle = await import('cycle');
//     return JSON.parse(cycle.default.retrocycle(data));
//   }
// }
//
// export { deserialize };
