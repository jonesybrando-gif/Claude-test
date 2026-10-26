/**
 * Campaign names as people should read them. Google Local Services campaigns
 * come from the API with system names like
 * "LocalServicesCampaign:SystemGenerated:00063546c0b2adc6".
 */
export function displayCampaignName(name: string): string {
  if (/^LocalServicesCampaign:/i.test(name)) return "Local Services ads";
  return name;
}
