const { CognitoJwtVerifier } = require('aws-jwt-verify');
// Or simpler: use the AWS SDK to authenticate with Cognito

const { fromCognitoIdentityPool } = require('@aws-sdk/credential-providers');
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

const REGION = 'eu-west-2';
const USER_POOL_ID = 'eu-west-2_76opnp6ffescubvuuao8am20d';
const CLIENT_ID = '76opnp6ffescubvuuao8am20d'; // Same as user pool? No, this needs to be the app client ID

async function getCredentials() {
  // Try to authenticate directly with Cognito using the same credentials as the API
  try {
    const provider = new CognitoIdentityProviderClient({ region: REGION });
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: 'eloyfuentesbermudez@gmail.com',
        PASSWORD: 'Teresa88.'
      }
    });
    const response = await provider.send(command);
    console.log('Auth response:', response.AuthenticationResult ? 'OK' : 'FAIL');
    if (response.AuthenticationResult) {
      const idToken = response.AuthenticationResult.IdToken;
      const accessToken = response.AuthenticationResult.AccessToken;
      console.log('ID Token:', idToken.substring(0, 30) + '...');
      
      // Now use the identity pool to get AWS credentials
      // Try common identity pool IDs
      const identityPools = [
        'eu-west-2:76opnp6ffescubvuuao8am20d',
        'eu-west-2:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      ];
      
      for (const poolId of identityPools) {
        try {
          const credentials = await fromCognitoIdentityPool({
            client: { region: REGION },
            identityPoolId: poolId,
            logins: {
              [`cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`]: idToken
            }
          })();
          console.log('Credentials obtained for pool:', poolId);
          
          // Try to list files in the S3 bucket
          const s3 = new S3Client({ region: 'eu-central-1', credentials });
          
          // Try to get the CDR file
          try {
            const cmd = new GetObjectCommand({
              Bucket: 'likes-brands-info',
              Key: 'cdrs_monthly.csv'
            });
            const data = await s3.send(cmd);
            const text = await data.Body.transformToString();
            console.log('✅ CSV downloaded! Length:', text.length);
            console.log('First 500 chars:', text.substring(0, 500));
            return text;
          } catch(e) {
            console.log('S3 error for cdrs_monthly.csv:', e.name);
            
            // Try list objects
            try {
              const listCmd = new ListObjectsV2Command({ Bucket: 'likes-brands-info', Prefix: '264/' });
              const list = await s3.send(listCmd);
              console.log('S3 objects:');
              (list.Contents || []).slice(0, 20).forEach(function(o) { console.log('  ' + o.Key); });
            } catch(e2) {
              console.log('List error:', e2.name);
            }
          }
          
          break;
        } catch(e) {
          console.log('Pool ' + poolId + ' failed:', e.name);
        }
      }
    }
  } catch(e) {
    console.log('Auth error:', e.name, e.message.substring(0, 100));
    if (e.code === 'NotAuthorizedException') console.log('Wrong credentials');
    if (e.code === 'ResourceNotFoundException') console.log('Wrong client ID');
  }
}

getCredentials().catch(console.error);
