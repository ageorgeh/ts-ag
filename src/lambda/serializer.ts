/**
 * Turns object into string.
 *
 * Uses different methods in production and otherwise for more readable output
 */
export async function stringify(data: any) {
  if (process.env.PUBLIC_ENVIRONMENT === 'production') {
    const { stringify: prodStrigify } = await import('@ungap/structured-clone/json');
    return prodStrigify(data);
  } else {
    const { decycle } = (await import('cycle')).default;
    return JSON.stringify(decycle(data), null);
  }
}
